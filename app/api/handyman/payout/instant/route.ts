import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBankAccountNumber } from "@/lib/security/bank-account-encryption";
import {
  createSouthAfricaRecipient,
  initiateSouthAfricaTransfer,
  verifySouthAfricaTransfer
} from "@/lib/paystack/transfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originIsAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || new URL(request.url).protocol.replace(":", "");
    return originUrl.host.toLowerCase() === host.toLowerCase()
      && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

async function getHandymanId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return profile?.role === "handyman" ? user.id : null;
}

export async function POST(request: Request) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const transferKey = process.env.PAYSTACK_TRANSFER_SECRET_KEY;
  if (!transferKey) {
    return NextResponse.json({ error: "Payout transfers are not configured yet." }, { status: 503 });
  }

  // This endpoint is deliberately test-only for the first integration pass.
  // A live key must never be used until the production payout workflow is approved.
  if (!transferKey.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Payout test mode is not enabled." }, { status: 503 });
  }

  try {
    const handymanId = await getHandymanId();
    if (!handymanId) {
      return NextResponse.json({ error: "Only active handyman accounts can request withdrawals." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const amountZar = Number(body?.amount_zar);
    if (!Number.isSafeInteger(amountZar) || amountZar <= 0) {
      return NextResponse.json({ error: "Enter a valid withdrawal amount." }, { status: 400 });
    }

    const admin = createAdminClient();

    // First look for an existing reservation. Recovery must not depend on the
    // handyman's current bank account, which may have changed or been deactivated.
    let recipientCode: string | null = null;

    // Recover one previously reserved request that failed before it was marked
    // processing. Never create a second request for the same reserved earnings.
    const { data: pendingRequests, error: pendingError } = await admin
      .from("handyman_payout_requests")
      .select("id, gross_amount_zar, fee_amount_zar, net_amount_zar, paystack_recipient_code_snapshot, transfer_reference, transfer_status")
      .eq("handyman_id", handymanId)
      .eq("payout_type", "instant")
      .in("status", ["requested", "processing"])
      .order("requested_at", { ascending: false })
      .limit(2);

    if (pendingError) throw pendingError;
    if ((pendingRequests ?? []).length > 1) {
      throw new Error("More than one unprocessed withdrawal request exists. Please contact support before retrying.");
    }

    let payoutRequestId: string;
    let grossAmountZar: number;
    let feeAmountZar: number;
    let netAmountKobo: number;
    let expectedRecipientCode: string | null = null;

    const pending = pendingRequests?.[0];
    if (pending) {
      if (Number(pending.gross_amount_zar) !== amountZar) {
        return NextResponse.json({
          error: "An earlier withdrawal request is awaiting recovery. Please use the same amount or contact support."
        }, { status: 409 });
      }

      const savedRecipientCode = pending.paystack_recipient_code_snapshot as string | null;
      if (!savedRecipientCode) {
        throw new Error("The original payout recipient is not recorded for this withdrawal. Please contact support before retrying.");
      }
      // Recovery must use only the recipient saved with the original request.
      // Never fall back to the handyman's current bank account.
      recipientCode = savedRecipientCode;
      expectedRecipientCode = savedRecipientCode;

      payoutRequestId = pending.id;
      grossAmountZar = Number(pending.gross_amount_zar);
      feeAmountZar = Number(pending.fee_amount_zar);
      // Convert the database decimal string to cents without relying on binary
      // floating-point rounding.
      const netAmount = String(pending.net_amount_zar);
      const [whole = "0", fraction = ""] = netAmount.split(".");
      if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) {
        throw new Error("Saved payout amount is not a valid ZAR decimal.");
      }
      netAmountKobo = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    } else {
      // Only a genuinely new withdrawal uses the current active bank account.
      // Existing requests above always recover against their saved recipient.
      const { data: bank, error: bankError } = await admin
        .from("handyman_bank_accounts")
        .select("id, bank_name, bank_code, account_holder_name, account_number_ciphertext, account_number_last4, paystack_recipient_code, is_active")
        .eq("handyman_id", handymanId)
        .eq("is_active", true)
        .maybeSingle();

      if (bankError) throw bankError;
      if (!bank) {
        return NextResponse.json({ error: "Please save your payout bank details first." }, { status: 400 });
      }

      recipientCode = bank.paystack_recipient_code as string | null;
      if (!recipientCode) {
        const accountNumber = decryptBankAccountNumber(bank.account_number_ciphertext);
        const recipient = await createSouthAfricaRecipient({
          name: bank.account_holder_name,
          accountNumber,
          bankCode: bank.bank_code,
          description: "Handyman On The Go payout recipient"
        });

        recipientCode = recipient.data.recipient_code;
        const { error: recipientSaveError } = await admin
          .from("handyman_bank_accounts")
          .update({
            paystack_recipient_code: recipientCode,
            updated_at: new Date().toISOString()
          })
          .eq("id", bank.id)
          .eq("handyman_id", handymanId);

        if (recipientSaveError) throw recipientSaveError;
      }
      expectedRecipientCode = recipientCode;

      // This reservation RPC derives the handyman from auth.uid(), so it
      // must run with the authenticated user's session, not service_role.
      const sessionClient = await createClient();
      const { data: payout, error: payoutError } = await sessionClient.rpc(
        "request_instant_handyman_payout",
        { p_amount_zar: amountZar }
      );

      if (payoutError) throw payoutError;

      payoutRequestId = payout?.payout_request_id;
      grossAmountZar = Number(payout?.gross_amount_zar);
      feeAmountZar = Number(payout?.fee_amount_zar);
      // Prefer the exact integer-kobo value returned by the reservation RPC.
      netAmountKobo = Number(payout?.net_amount_kobo);
    }

    if (typeof payoutRequestId !== "string"
      || !Number.isSafeInteger(netAmountKobo)
      || netAmountKobo <= 0
      || !Number.isFinite(grossAmountZar)
      || !Number.isFinite(feeAmountZar)) {
      throw new Error("Payout request was found or created without valid transfer amounts.");
    }

    // Paystack transfer references must be 16-50 chars and use lowercase letters,
    // digits, dash and underscore. The request UUID makes retries idempotent.
    const reference = `hmg_instant_${payoutRequestId.replaceAll("-", "")}`;

    const { error: processingError } = await admin.rpc(
      "mark_handyman_payout_processing",
      {
        p_payout_request_id: payoutRequestId,
        p_transfer_reference: reference
      }
    );
    if (processingError) throw processingError;

    // Always verify the deterministic reference before attempting another
    // transfer. A verification outage is not treated as "not found".
    let transfer = await verifySouthAfricaTransfer(reference);
    if (transfer) {
      const verifiedRecipientCode = typeof transfer.data.recipient === "object"
        && transfer.data.recipient !== null
        ? transfer.data.recipient.recipient_code
        : null;

      if (transfer.data.reference !== reference
        || transfer.data.currency !== "ZAR"
        || transfer.data.amount !== netAmountKobo
        || !expectedRecipientCode
        || verifiedRecipientCode !== expectedRecipientCode) {
        throw new Error("The existing Paystack transfer does not match this withdrawal or its saved bank recipient. Please contact support.");
      }
    } else {
      try {
        transfer = await initiateSouthAfricaTransfer({
          amountKobo: netAmountKobo,
          recipientCode,
          reference,
          reason: "Handyman On The Go instant withdrawal"
        });
      } catch (error) {
        // Even a 4xx response is left for verification/reconciliation. Never
        // release reserved earnings based only on an ambiguous API response.
        console.error("Paystack transfer initiation needs verification:", error);
        return NextResponse.json({
          success: true,
          payoutRequestId,
          grossAmountZar,
          feeAmountZar,
          netAmountZar: netAmountKobo / 100,
          netAmountKobo,
          transferStatus: "pending",
          transferReference: reference
        });
      }
    }

    const transferStatus = transfer.data.status;

    // Persist the Paystack transfer code and current state for reconciliation.
    // OTP approval remains manual in the Paystack dashboard; never store OTPs.
    const transferCode = transfer.data.transfer_code;
    const { error: transferStateError } = await admin
      .from("handyman_payout_requests")
      .update({
        ...(transferCode ? { transfer_code: transferCode } : {}),
        transfer_status: transferStatus
      })
      .eq("id", payoutRequestId)
      .eq("transfer_reference", reference)
      .eq("status", "processing");
    if (transferStateError) throw transferStateError;

    if (transferStatus === "success" || transferStatus === "failed" || transferStatus === "reversed") {
      const { error: settleError } = await admin.rpc("settle_handyman_payout", {
        p_transfer_reference: reference,
        p_transfer_status: transferStatus,
        p_failure_reason: transfer.data.failures
          ? JSON.stringify(transfer.data.failures)
          : null
      });
      if (settleError) throw settleError;
    }

    return NextResponse.json({
      success: true,
      payoutRequestId,
      grossAmountZar,
      feeAmountZar,
      netAmountZar: netAmountKobo / 100,
      netAmountKobo,
      transferStatus,
      transferReference: reference
    });
  } catch (error) {
    console.error("Instant payout failed:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "We could not process the withdrawal."
    }, { status: 500 });
  }
}
