import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, "hex");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    if (event.event !== "charge.success") return NextResponse.json({ received: true });

    const payment = event.data;
    const reference = payment?.reference;
    if (payment?.status !== "success" || payment?.currency !== "ZAR" || typeof reference !== "string") {
      return NextResponse.json({ received: true });
    }

    const admin = createAdminClient();
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
