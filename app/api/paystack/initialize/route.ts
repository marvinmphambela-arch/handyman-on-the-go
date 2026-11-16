import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "handyman") return NextResponse.json({ error: "Only handyman accounts can top up this wallet." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 100000) {
      return NextResponse.json({ error: "Enter a whole-rand amount between R100 and R100,000." }, { status: 400 });
    }
    if (!user.email) return NextResponse.json({ error: "Your account needs an email address for payment." }, { status: 400 });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "https://handyman-on-the-go.onrender.com";
    if (!secret) return NextResponse.json({ error: "Payment service is not configured yet." }, { status: 503 });

    const admin = createAdminClient();
    const reference = `hgo_topup_${user.id.replaceAll("-", "").slice(0, 12)}_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const { error: insertError } = await admin.from("handyman_access_wallet_transactions").insert({
      handyman_id: user.id,
      transaction_type: "top_up",
      direction: "credit",
      amount_zar: amount,
      status: "pending",
      payment_reference: reference,
      description: "Paystack Access Wallet top-up"
    });
    if (insertError) throw insertError;

    const callbackUrl = new URL("/api/paystack/callback", siteUrl).toString();
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: String(amount * 100),
        currency: "ZAR",
        reference,
        callback_url: callbackUrl,
        metadata: { purpose: "handyman_access_wallet_topup", handyman_id: user.id, amount_zar: amount }
      }),
      cache: "no-store"
    });
    const result = await paystackResponse.json();
    if (!paystackResponse.ok || !result.status || !result.data?.authorization_url) {
      await admin.from("handyman_access_wallet_transactions").update({ status: "failed" }).eq("payment_reference", reference);
      return NextResponse.json({ error: result.message || "Paystack could not start the payment. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ authorizationUrl: result.data.authorization_url });
  } catch (error) {
    console.error("Paystack top-up initialization failed:", error);
    return NextResponse.json({ error: "We could not start your top-up. Please try again." }, { status: 500 });
  }
}
