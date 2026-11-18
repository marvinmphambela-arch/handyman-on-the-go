import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ServiceReceiptActions from "@/components/service-receipt-actions";

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(value);

export default async function ServiceReceiptPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase.from("jobs")
    .select("id, customer_id, title, description, city, suburb, status, created_at, service_categories(name), job_offers(handyman_id, amount_zar, status)")
    .eq("id", jobId).eq("customer_id", user.id).maybeSingle();
  if (!job || job.status !== "completed") notFound();

  const offers = (job.job_offers ?? []) as { handyman_id: string; amount_zar: number; status: string }[];
  const accepted = offers.find(offer => offer.status === "accepted");
  if (!accepted) notFound();

  const [{ data: customer }, { data: handyman }, { data: earning }, { data: payments }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", accepted.handyman_id).maybeSingle(),
    supabase.from("handyman_earnings").select("labour_amount_zar, payment_method, completed_at").eq("job_id", job.id).maybeSingle(),
    supabase.from("customer_job_payments").select("status, paid_at").eq("job_id", job.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(1)
  ]);
  if (!earning) notFound();

  const platformPaid = earning.payment_method === "platform" && (payments ?? []).length > 0;
  const paymentLabel = platformPaid
    ? "Paid — platform payment verified"
    : earning.payment_method === "direct_eft"
      ? "Customer confirmed direct EFT — not independently verified by the platform"
      : "Payment status requires support review";
  const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : (job.service_categories as { name: string } | null)?.name;
  const receiptNumber = `HGO-${job.id.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const serviceDate = earning.completed_at ?? job.created_at;

  return <main className="request-page receipt-page">
    <header className="request-nav no-print"><div className="container request-nav-inner"><Link href="/account" className="brand"><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link><Link href="/account" className="text-link">Customer dashboard</Link></div></header>
    <div className="container request-shell"><article className="request-card service-receipt">
      <div className="receipt-heading"><div><div className="eyebrow">HANDYMAN ON THE GO</div><h1>Service receipt</h1><p>Receipt {receiptNumber}</p></div><span className="receipt-mark">HGO</span></div>
      <div className="receipt-payment"><small>PAYMENT RECORD</small><strong>{paymentLabel}</strong></div>
      <div className="receipt-grid"><div><small>CUSTOMER</small><strong>{customer?.full_name || "Customer"}</strong></div><div><small>SERVICE PROVIDER</small><strong>{handyman?.full_name || "Handyman"}</strong></div><div><small>SERVICE DATE</small><strong>{new Date(serviceDate).toLocaleDateString("en-ZA", { dateStyle: "long" })}</strong></div><div><small>RECEIPT ISSUED</small><strong>{new Date().toLocaleDateString("en-ZA", { dateStyle: "long" })}</strong></div></div>
      <hr />
      <div className="receipt-service"><small>SERVICE</small><h2>{job.title}</h2><p>{category || "Home service"} · {[job.suburb, job.city].filter(Boolean).join(", ")}</p><p>{job.description}</p></div>
      <div className="receipt-total"><span>Service amount</span><strong>{money(earning.labour_amount_zar)}</strong></div>
      <p className="privacy-note receipt-note">This is a service receipt, not a VAT tax invoice. Direct EFT payment is recorded based on the customer’s completion confirmation and has not been independently verified by Handyman On The Go.</p>
      <ServiceReceiptActions />
    </article></div>
    <style>{`@media print { .no-print, .receipt-actions { display:none !important; } body { background:#fff !important; } .receipt-page { padding:0 !important; } .service-receipt { box-shadow:none !important; border:0 !important; } }
    .service-receipt { max-width:760px; margin:32px auto; padding:clamp(22px,5vw,44px); }
    .receipt-heading,.receipt-total { display:flex; justify-content:space-between; align-items:center; gap:20px; }
    .receipt-heading h1 { margin:8px 0; font-size:2rem; }
    .receipt-mark { display:grid; place-items:center; width:64px; height:64px; border-radius:18px; background:#fff1e8; color:#e66b27; font-weight:800; }
    .receipt-payment { margin:28px 0; padding:16px; border-radius:12px; background:#f5f7f8; display:grid; gap:6px; }
    .receipt-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:22px; }
    .receipt-grid div,.receipt-service { display:grid; gap:6px; }
    .receipt-grid small,.receipt-service small,.receipt-payment small { color:#667085; font-size:.72rem; font-weight:700; letter-spacing:.06em; }
    .service-receipt hr { border:0; border-top:1px solid #e5e7eb; margin:26px 0; }
    .receipt-service h2 { margin:0; }
    .receipt-total { border-top:1px solid #e5e7eb; margin-top:28px; padding-top:22px; font-size:1.1rem; }
    .receipt-total strong { font-size:1.5rem; }
    .receipt-note { margin-top:24px; }
    .receipt-actions { display:flex; align-items:center; gap:18px; margin-top:24px; flex-wrap:wrap; }
    @media(max-width:560px) { .receipt-grid { grid-template-columns:1fr; } }
    `}</style>
  </main>;
}
