import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "https://handyman-on-the-go.onrender.com";
  const destination = new URL("/account", siteUrl);

  if (!reference || !/^[a-zA-Z0-9_=\-]{8,120}$/.test(reference)) {
    destination.searchParams.set("job_payment", "failed");
    return NextResponse.redirect(destination);
  }

  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("Paystack is not configured.");
    const admin = createAdminClient();
    const { data: pending, error: lookupError } = await admin.from("customer_job_payments")
      .select("id, job_id, customer_id, handyman_id, amount_zar, currency, status")
      .eq("payment_reference", reference)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!pending) {
      destination.searchParams.set("job_payment", "failed");
      return NextResponse.redirect(destination);
    }

    destination.searchParams.set("job_id", pending.job_id);
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store"
    });
    const verification = await verifyResponse.json();
    const payment = verification.data;
    const metadata = payment?.metadata || {};
    const metadataMatches =
      metadata.purpose === "customer_job_payment" &&
      metadata.payment_id === pending.id &&
      metadata.job_id === pending.job_id &&
      metadata.customer_id === pending.customer_id &&
      metadata.handyman_id === pending.handyman_id &&
      Number(metadata.amount_zar) === pending.amount_zar;

    if (!verifyResponse.ok || !verification.status || payment?.status !== "success" ||
        payment?.currency !== "ZAR" || payment?.reference !== reference ||
        payment?.amount !== pending.amount_zar * 100 || pending.currency !== "ZAR" || !metadataMatches) {
      destination.searchParams.set("job_payment", "failed");
      return NextResponse.redirect(destination);
    }

    const { data: paymentResult, error: recordError } = await admin.rpc("record_verified_customer_job_payment", {
      p_reference: reference,
      p_amount_zar: pending.amount_zar,
      p_currency: "ZAR"
    });
    if (recordError) throw recordError;

    destination.searchParams.set("job_payment", paymentResult === "duplicate_paid" ? "duplicate" : "verified");
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Customer job payment callback failed:", error);
    destination.searchParams.set("job_payment", "error");
    return NextResponse.redirect(destination);
  }
}
