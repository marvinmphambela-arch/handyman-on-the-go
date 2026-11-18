import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBankAccountNumber } from "@/lib/security/bank-account-encryption";
import {
  createSouthAfricaRecipient,
  initiateSouthAfricaTransfer
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

    let recipientCode = bank.paystack_recipient_code as string | null;

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

    const { data: payout, error: payoutError } = await admin.rpc(
      "request_instant_handyman_payout",
      { p_handyman_id: handymanId, p_amount_zar: amountZar }
    );

    if (payoutError) throw payoutError;

    const payoutRequestId = payout?.payout_request_id;
    const netAmountKobo = Number(payout?.net_amount_kobo);
    if (typeof payoutRequestId !== "string" || !Number.isSafeInteger(netAmountKobo) || netAmountKobo <= 0) {
      throw new Error("Payout request was created without a valid transfer amount.");
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

    let transfer;
    try {
      transfer = await initiateSouthAfricaTransfer({
        amountKobo: netAmountKobo,
        recipientCode,
        reference,
        reason: "Handyman On The Go instant withdrawal"
      });
    } catch (error) {
      // A network/timeout error is intentionally left as processing because
      // Paystack may have accepted the request. The same reference must be
      // retried/verified rather than creating a second transfer.
      const status = (error as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        await admin.rpc("settle_handyman_payout", {
          p_transfer_reference: reference,
          p_transfer_status: "failed",
          p_failure_reason: (error as Error).message
        });
        return NextResponse.json({ error: (error as Error).message }, { status: 502 });
      }
      throw error;
    }

    const transferStatus = transfer.data.status;
    if (transferStatus === "success") {
      const { error: settleError } = await admin.rpc("settle_handyman_payout", {
        p_transfer_reference: reference,
        p_transfer_status: "success"
      });
      if (settleError) throw settleError;
    }

    return NextResponse.json({
      success: true,
      payoutRequestId,
      grossAmountZar: payout.gross_amount_zar,
      feeAmountZar: payout.fee_amount_zar,
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
