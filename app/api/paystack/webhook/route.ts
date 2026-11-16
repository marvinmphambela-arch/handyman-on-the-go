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

    const metadata = payment.metadata || {};
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
