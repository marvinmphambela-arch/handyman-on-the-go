import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (!user.email) return NextResponse.json({ error: "Your account needs an email address for payment." }, { status: 400 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "customer") {
      return NextResponse.json({ error: "Only the customer who posted this job can pay for it." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const jobId = typeof body.jobId === "string" ? body.jobId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jobId)) {
      return NextResponse.json({ error: "A valid job is required." }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "https://handyman-on-the-go.onrender.com";
    if (!secret) return NextResponse.json({ error: "Payment service is not configured yet." }, { status: 503 });

    const admin = createAdminClient();
    const { data: job, error: jobError } = await admin.from("jobs")
      .select("id, customer_id, status")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job || job.customer_id !== user.id) {
      return NextResponse.json({ error: "This job was not found under your account." }, { status: 404 });
    }
    if (job.status !== "in_progress") {
      return NextResponse.json({ error: "Payment can only be started after the job is in progress." }, { status: 409 });
    }

    const { data: acceptedOffer, error: offerError } = await admin.from("job_offers")
      .select("handyman_id, amount_zar")
      .eq("job_id", jobId)
      .eq("status", "accepted")
      .maybeSingle();
    if (offerError) throw offerError;
    if (!acceptedOffer || !Number.isSafeInteger(acceptedOffer.amount_zar) || acceptedOffer.amount_zar <= 0) {
      return NextResponse.json({ error: "The accepted handyman offer could not be verified." }, { status: 409 });
    }

    const { data: paidPayment, error: paidLookupError } = await admin.from("customer_job_payments")
      .select("id")
      .eq("job_id", jobId)
      .eq("status", "paid")
      .maybeSingle();
    if (paidLookupError) throw paidLookupError;
    if (paidPayment) return NextResponse.json({ alreadyPaid: true });

    // Supersede older unfinished checkout attempts. A late success is still handled safely
    // by the database RPC, which allows only the first verified payment for this job.
    const { error: abandonError } = await admin.from("customer_job_payments")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("job_id", jobId)
      .eq("status", "pending");
    if (abandonError) throw abandonError;

    const paymentId = randomUUID();
    const reference = `hgo_job_${jobId.replaceAll("-", "").slice(0, 12)}_${Date.now()}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const { error: insertError } = await admin.from("customer_job_payments").insert({
      id: paymentId,
      job_id: jobId,
      customer_id: user.id,
      handyman_id: acceptedOffer.handyman_id,
      amount_zar: acceptedOffer.amount_zar,
      currency: "ZAR",
      payment_reference: reference,
      status: "pending"
    });
    if (insertError) throw insertError;

    const callbackUrl = new URL("/api/paystack/job-payment/callback", siteUrl).toString();
    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: String(acceptedOffer.amount_zar * 100),
        currency: "ZAR",
        reference,
        callback_url: callbackUrl,
        metadata: {
          purpose: "customer_job_payment",
          payment_id: paymentId,
          job_id: jobId,
          customer_id: user.id,
          handyman_id: acceptedOffer.handyman_id,
          amount_zar: acceptedOffer.amount_zar
        }
      }),
      cache: "no-store"
    });
    const result = await paystackResponse.json();
    if (!paystackResponse.ok || !result.status || !result.data?.authorization_url) {
      await admin.from("customer_job_payments")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", paymentId);
      return NextResponse.json({ error: result.message || "Paystack could not start the payment. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ authorizationUrl: result.data.authorization_url });
  } catch (error) {
    console.error("Customer job payment initialization failed:", error);
    return NextResponse.json({ error: "We could not start this payment. Please try again." }, { status: 500 });
  }
}
