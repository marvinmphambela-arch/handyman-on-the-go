import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "https://handyman-on-the-go.onrender.com";
  const destination = new URL("/handyman", siteUrl);
  destination.searchParams.set("section", "earnings");

  if (!reference || !/^[a-zA-Z0-9_.=\-]{8,100}$/.test(reference)) {
    destination.searchParams.set("topup", "invalid");
    return NextResponse.redirect(destination);
  }

  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error("Paystack is not configured.");
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store"
    });
    const verification = await verifyResponse.json();
    if (!verifyResponse.ok || !verification.status || verification.data?.status !== "success" || verification.data?.currency !== "ZAR" || verification.data?.reference !== reference) {
      destination.searchParams.set("topup", "not_verified");
      return NextResponse.redirect(destination);
    }

    const admin = createAdminClient();
    const { data: pending } = await admin.from("handyman_access_wallet_transactions")
      .select("handyman_id, amount_zar, status")
      .eq("payment_reference", reference)
      .eq("transaction_type", "top_up")
      .maybeSingle();

    if (!pending || pending.status === "failed" || verification.data.amount !== pending.amount_zar * 100) {
      destination.searchParams.set("topup", "mismatch");
      return NextResponse.redirect(destination);
    }

    const metadata = verification.data.metadata || {};
    if (metadata.purpose !== "handyman_access_wallet_topup" || metadata.handyman_id !== pending.handyman_id || Number(metadata.amount_zar) !== pending.amount_zar) {
      destination.searchParams.set("topup", "mismatch");
      return NextResponse.redirect(destination);
    }

    const { error } = await admin.rpc("post_verified_handyman_topup", {
      p_handyman_id: pending.handyman_id,
      p_reference: reference,
      p_amount_zar: pending.amount_zar
    });
    if (error) throw error;
    destination.searchParams.set("topup", "success");
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Paystack callback verification failed:", error);
    destination.searchParams.set("topup", "error");
    return NextResponse.redirect(destination);
  }
}
