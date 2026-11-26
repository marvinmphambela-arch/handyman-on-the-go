import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateSouthAfricaTransfer, verifySouthAfricaTransfer } from "@/lib/paystack/transfers";

export const runtime = "nodejs";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export async function POST(request: Request) {
  const token = process.env.WEEKLY_PAYOUT_CRON_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  if (!token || !timingSafeEqual(digest(authorization), digest(`Bearer ${token}`))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!process.env.PAYSTACK_TRANSFER_SECRET_KEY?.startsWith("sk_test_")) {
    return NextResponse.json({ error: "Weekly payout staging requires a Paystack test transfer key." }, { status: 503 });
  }

  const admin = createAdminClient();
  const monday = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short"
  }).format(new Date()) === "Mon";
  let errors = 0;
  let processed = 0;

  try {
    if (monday) {
      let lastHandymanId: string | undefined;
      for (;;) {
        let query = admin.from("handyman_bank_accounts")
          .select("handyman_id").eq("is_active", true)
          .not("paystack_recipient_code", "is", null)
          .order("handyman_id").limit(100);
        if (lastHandymanId) query = query.gt("handyman_id", lastHandymanId);
        const { data: accounts, error } = await query;
        if (error) throw error;
        for (const account of accounts) {
          const { error: reserveError } = await admin.rpc("reserve_handyman_weekly_payout", {
            p_handyman_id: account.handyman_id
          });
          if (reserveError) {
            errors += 1;
            console.error("Weekly payout reservation failed.", { code: reserveError.code });
          }
        }
        if (accounts.length < 100) break;
        lastHandymanId = accounts[accounts.length - 1].handyman_id;
      }
    }

    let lastPayoutId: string | undefined;
    for (;;) {
      let query = admin.from("handyman_payout_requests")
        .select("id, net_amount_zar, status, transfer_code, transfer_status, transfer_reference, paystack_recipient_code_snapshot")
        .eq("payout_type", "weekly").in("status", ["requested", "processing"])
        .order("id").limit(100);
      if (lastPayoutId) query = query.gt("id", lastPayoutId);
      const { data: payouts, error } = await query;
      if (error) throw error;

      for (const payout of payouts) {
        try {
          const reference = `hmg_weekly_${payout.id.replaceAll("-", "")}`;
          const amount = Number(payout.net_amount_zar);
          const amountCents = amount * 100;
          const recipientCode = payout.paystack_recipient_code_snapshot;
          if (!recipientCode || !Number.isSafeInteger(amount) || amount <= 0
              || !Number.isSafeInteger(amountCents)
              || (payout.transfer_reference && payout.transfer_reference !== reference)) {
            throw new Error("Invalid saved payout details.");
          }

          const { error: processingError } = await admin.rpc("mark_handyman_payout_processing", {
            p_payout_request_id: payout.id,
            p_transfer_reference: reference
          });
          if (processingError) throw processingError;

          let transfer = await verifySouthAfricaTransfer(reference);
          if (!transfer && !payout.transfer_code && !["otp", "success", "failed", "reversed"].includes(payout.transfer_status)) {
            await initiateSouthAfricaTransfer({
              amountKobo: amountCents,
              recipientCode,
              reference,
              reason: "Handyman On The Go weekly payout"
            });
            transfer = await verifySouthAfricaTransfer(reference);
          }
          if (!transfer) throw new Error("Transfer verification is pending.");

          const details = transfer.data;
          if (details.reference !== reference || details.currency !== "ZAR" || details.amount !== amountCents
              || typeof details.recipient !== "object" || details.recipient?.recipient_code !== recipientCode) {
            throw new Error("Verified transfer does not match the saved payout.");
          }

          const { error: stateError } = await admin.from("handyman_payout_requests")
            .update({
              ...(details.transfer_code ? { transfer_code: details.transfer_code } : {}),
              transfer_status: details.status
            })
            .eq("id", payout.id).eq("status", "processing");
          if (stateError) throw stateError;

          if (["success", "failed", "reversed"].includes(details.status)) {
            const { error: settleError } = await admin.rpc("settle_handyman_payout", {
              p_transfer_reference: reference,
              p_transfer_status: details.status,
              p_failure_reason: details.failures ? JSON.stringify(details.failures) : null
            });
            if (settleError) throw settleError;
          }
          processed += 1;
        } catch {
          errors += 1;
          console.error("Weekly payout requires reconciliation.", { payoutId: payout.id });
        }
      }
      if (payouts.length < 100) break;
      lastPayoutId = payouts[payouts.length - 1].id;
    }
  } catch {
    console.error("Weekly payout job could not complete.");
    errors += 1;
  }

  return NextResponse.json({ processed, errors }, { status: errors ? 500 : 200 });
}
