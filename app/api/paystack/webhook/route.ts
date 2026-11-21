import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  console.info("Paystack webhook request received.");
  const paymentSecret = process.env.PAYSTACK_SECRET_KEY;
  const transferSecret = process.env.PAYSTACK_TRANSFER_SECRET_KEY;
  if (!paymentSecret && !transferSecret) {
    console.error("Paystack webhook is not configured: no API secret key is present.");
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();

  // This Paystack dashboard currently exposes the legacy webhook signature
  // flow only. Verify X-Paystack-Signature against the configured API secret.
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    console.warn("Paystack webhook rejected: signature header is missing or malformed.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supplied = Buffer.from(signature, "hex");
  const secrets = [paymentSecret, transferSecret].filter((value): value is string => Boolean(value));
  const validSignature = secrets.some(secret => {
    const expected = createHmac("sha512", secret).update(rawBody).digest();
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!validSignature) {
    console.warn("Paystack webhook rejected: signature did not match configured API secret keys.");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  console.info("Paystack webhook signature verified.");

  try {
    const event = JSON.parse(rawBody);
    console.info("Paystack webhook event accepted.", {
      event: event?.event,
      reference: event?.data?.reference ?? null
    });
    const admin = createAdminClient();

    if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event.event)) {
      const transfer = event.data;
      const reference = transfer?.reference;
      const currency = transfer?.currency;
      const amount = Number(transfer?.amount);

      if (typeof reference !== "string" || currency !== "ZAR" || !Number.isSafeInteger(amount) || amount <= 0) {
        return NextResponse.json({ received: true });
      }

      const { data: payout, error: payoutLookupError } = await admin
        .from("handyman_payout_requests")
        .select("id, net_amount_zar, status, transfer_reference, paystack_recipient_code_snapshot")
        .eq("transfer_reference", reference)
        .maybeSingle();

      if (payoutLookupError) throw payoutLookupError;
      if (!payout || payout.transfer_reference !== reference) {
        console.warn("Paystack transfer webhook ignored: no matching payout request.", { reference });
        return NextResponse.json({ received: true });
      }

      // Paystack amounts are in the currency subunit. For ZAR that is cents.
      // Require the event to identify the exact saved recipient as well.
      const eventRecipientCode = typeof transfer?.recipient === "object"
        && transfer.recipient !== null
        ? transfer.recipient.recipient_code
        : null;

      if (amount !== payout.net_amount_zar * 100
          || !payout.paystack_recipient_code_snapshot
          || eventRecipientCode !== payout.paystack_recipient_code_snapshot) {
        console.warn("Paystack transfer webhook ignored: amount did not match payout.", { reference });
        return NextResponse.json({ received: true });
      }

      const statusMap: Record<string, "success" | "failed" | "reversed"> = {
        "transfer.success": "success",
        "transfer.failed": "failed",
        "transfer.reversed": "reversed"
      };
      const eventStatus = statusMap[event.event];
      if (transfer?.status !== eventStatus) {
        console.warn("Paystack transfer webhook ignored: event name and transfer status disagree.", {
          reference,
          event: event.event,
          transferStatus: transfer?.status
        });
        return NextResponse.json({ received: true });
      }

      const { error: settleError } = await admin.rpc("settle_handyman_payout", {
        p_transfer_reference: reference,
        p_transfer_status: eventStatus,
        p_failure_reason: typeof transfer?.failures === "string"
          ? transfer.failures
          : transfer?.failures ? JSON.stringify(transfer.failures) : null
      });
      if (settleError) throw settleError;
      console.info("Paystack transfer webhook settled payout.", { reference, status: statusMap[event.event] });

      return NextResponse.json({ received: true, payoutProcessed: true });
    }
    if (event.event !== "charge.success") return NextResponse.json({ received: true });

    const payment = event.data;
    const reference = payment?.reference;
    if (payment?.status !== "success" || payment?.currency !== "ZAR" || typeof reference !== "string") {
      return NextResponse.json({ received: true });
    }

    const metadata = payment.metadata || {};

    // Customer job payments are matched against the server-created payment row.
    // The database RPC is idempotent and arbitrates late/duplicate successful attempts.
    if (metadata.purpose === "customer_job_payment") {
      const { data: pending, error: lookupError } = await admin
        .from("customer_job_payments")
        .select("id, job_id, customer_id, handyman_id, amount_zar, currency")
        .eq("payment_reference", reference)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (!pending ||
          pending.id !== metadata.payment_id ||
          pending.job_id !== metadata.job_id ||
          pending.customer_id !== metadata.customer_id ||
          pending.handyman_id !== metadata.handyman_id ||
          pending.currency !== "ZAR" ||
          payment.amount !== pending.amount_zar * 100 ||
          Number(metadata.amount_zar) !== pending.amount_zar) {
        return NextResponse.json({ received: true });
      }

      const { data: result, error: recordError } = await admin.rpc("record_verified_customer_job_payment", {
        p_reference: reference,
        p_amount_zar: pending.amount_zar,
        p_currency: "ZAR"
      });
      if (recordError) throw recordError;
      return NextResponse.json({ received: true, jobPayment: result });
    }

    // Existing Access Wallet top-up webhook remains unchanged.
    const { data: pending, error: lookupError } = await admin
      .from("handyman_access_wallet_transactions")
      .select("handyman_id, amount_zar, status")
      .eq("payment_reference", reference)
      .eq("transaction_type", "top_up")
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!pending || pending.status === "failed" || payment.amount !== pending.amount_zar * 100) {
      return NextResponse.json({ received: true });
    }

    if (metadata.purpose !== "handyman_access_wallet_topup" ||
        metadata.handyman_id !== pending.handyman_id ||
        Number(metadata.amount_zar) !== pending.amount_zar) {
      return NextResponse.json({ received: true });
    }

    const { error: creditError } = await admin.rpc("post_verified_handyman_topup", {
      p_handyman_id: pending.handyman_id,
      p_reference: reference,
      p_amount_zar: pending.amount_zar
    });
    if (creditError) throw creditError;

    return NextResponse.json({ received: true, credited: true });
  } catch (error) {
    console.error("Paystack webhook processing failed:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
