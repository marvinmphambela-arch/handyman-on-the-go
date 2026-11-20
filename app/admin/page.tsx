import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VerificationActions from "./verification-actions";
import CancellationReviewActions from "./cancellation-review-actions";
import AccountManagement from "./account-management";
import JobsBookingsManagement from "./jobs-bookings-management";

type Submission = {
  handyman_id: string;
  id_document_path: string;
  selfie_path: string;
  status: string;
  submitted_at: string;
  profiles: { full_name: string | null; phone: string | null } | null;
};

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/account");

  const [customerAccountsResult, handymanAccountsResult] = await Promise.all([
    supabase.rpc("admin_list_managed_accounts", { p_role: "customer" }),
    supabase.rpc("admin_list_managed_accounts", { p_role: "handyman" })
  ]);
  const accountManagementError = customerAccountsResult.error || handymanAccountsResult.error;
  const customerAccounts = (customerAccountsResult.data ?? []) as {
    id: string; role: "customer"; full_name: string | null; phone: string | null;
    created_at: string; account_status: "active" | "suspended"; verification_status: string | null; email_verified: boolean;
  }[];
  const handymanAccounts = (handymanAccountsResult.data ?? []) as {
    id: string; role: "handyman"; full_name: string | null; phone: string | null;
    created_at: string; account_status: "active" | "suspended"; verification_status: string | null; email_verified: boolean;
  }[];

  // Aggregate counts are returned by an admin-only SECURITY DEFINER RPC.
  const [overviewResult, paidPayments] = await Promise.all([
    supabase.rpc("get_admin_platform_overview"),
    supabase.from("customer_job_payments").select("amount_zar").eq("status", "paid")
  ]);
  const statsError = overviewResult.error || paidPayments.error;
  const overview = overviewResult.data as {
    customers: number;
    handymen: number;
    jobs_posted: number;
    open_jobs: number;
    active_bookings: number;
    completed_jobs: number;
    cancelled_jobs: number;
    other_jobs: number;
  } | null;
  const verifiedPaymentsTotal = (paidPayments.data ?? []).reduce((sum, payment) => sum + payment.amount_zar, 0);

  const { data, error } = await supabase
    .from("handyman_verification_submissions")
    .select("handyman_id, id_document_path, selfie_path, status, submitted_at, profiles!handyman_verification_submissions_handyman_id_fkey(full_name, phone)")
    .order("submitted_at", { ascending: true });

  const submissions = (data ?? []) as unknown as Submission[];
  const pending = submissions.filter(item => item.status === "under_review");

  const { data: cancellationRequests, error: cancellationError } = await supabase
    .from("booking_cancellation_requests")
    .select("id, reason, concern_type, created_at, jobs(title), profiles!booking_cancellation_requests_customer_id_fkey(full_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const documents = await Promise.all(submissions.map(async item => {
    const [idResult, selfieResult] = await Promise.all([
      supabase.storage.from("handyman-verification").createSignedUrl(item.id_document_path, 300),
      supabase.storage.from("handyman-verification").createSignedUrl(item.selfie_path, 300)
    ]);
    return { handymanId: item.handyman_id, idUrl: idResult.data?.signedUrl ?? null, selfieUrl: selfieResult.data?.signedUrl ?? null };
  }));

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/account" className="back-link">My account</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">ADMINISTRATION</div><h1>Administrator dashboard.</h1><p>Review handyman identity submissions and record approval decisions. Verification documents are private and temporary links expire after five minutes.</p></div>
      <section className="request-card">
        <div className="eyebrow">PLATFORM OVERVIEW</div>
        <h2>Marketplace at a glance</h2>
        {statsError ? <p role="alert">Platform statistics could not be loaded: {statsError.message}</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "16px", marginTop: "18px" }}>
          {[
            ["Customers", overview?.customers ?? 0],
            ["Handymen", overview?.handymen ?? 0],
            ["Jobs posted", overview?.jobs_posted ?? 0],
            ["Open jobs", overview?.open_jobs ?? 0],
            ["Active bookings", overview?.active_bookings ?? 0],
            ["Completed jobs", overview?.completed_jobs ?? 0],
            ["Cancelled jobs", overview?.cancelled_jobs ?? 0],
            ["Other-status jobs", overview?.other_jobs ?? 0]
          ].map(([label, value]) => <div key={label} style={{ padding: "14px", border: "1px solid #e7e7e7", borderRadius: "12px" }}>
            <div className="eyebrow">{label}</div><div style={{ fontSize: "28px", fontWeight: 650 }}>{value}</div>
          </div>)}
          <div style={{ padding: "14px", border: "1px solid #e7e7e7", borderRadius: "12px" }}>
            <div className="eyebrow">Jobs accounted for</div>
            <div style={{ fontSize: "28px", fontWeight: 650 }}>
              {(overview?.open_jobs ?? 0) + (overview?.active_bookings ?? 0) + (overview?.completed_jobs ?? 0) + (overview?.cancelled_jobs ?? 0) + (overview?.other_jobs ?? 0)}
            </div>
            <p className="form-hint">Should equal total jobs posted.</p>
          </div>
          <div style={{ padding: "14px", border: "1px solid #e7e7e7", borderRadius: "12px" }}>
            <div className="eyebrow">Job status total</div>
            <div style={{ fontSize: "28px", fontWeight: 650 }}>{(overview?.open_jobs ?? 0) + (overview?.active_bookings ?? 0) + (overview?.completed_jobs ?? 0) + (overview?.cancelled_jobs ?? 0) + (overview?.other_jobs ?? 0)}</div>
            <p className="form-hint">All job statuses combined; should match jobs posted.</p>
          </div>
          <div style={{ padding: "14px", border: "1px solid #e7e7e7", borderRadius: "12px" }}>
            <div className="eyebrow">Verified customer payments</div><div style={{ fontSize: "28px", fontWeight: 650 }}>R{verifiedPaymentsTotal.toLocaleString("en-ZA")}</div>
            <p className="form-hint">Successful paid job payments only; not platform revenue.</p>
          </div>
        </div>}
      </section>
      {accountManagementError
        ? <section className="request-card"><h2>Account directory could not be loaded.</h2><p>{accountManagementError.message}</p></section>
        : <AccountManagement customers={customerAccounts} handymen={handymanAccounts} />}
      <JobsBookingsManagement />
      {cancellationError && <section className="request-card"><h2>Could not load cancellation reviews.</h2><p>{cancellationError.message}</p></section>}
      {!cancellationError && <section className="request-card"><div className="eyebrow">CUSTOMER PROTECTION</div><h2>{cancellationRequests?.length ?? 0} cancellation requests awaiting review</h2><p>Review safety, behaviour, workmanship, and other concerns. Approved requests cancel the booking without automatic travel compensation.</p></section>}
      {(cancellationRequests ?? []).map((item: any) => <article className="request-card" key={item.id}>
        <div className="eyebrow">IN-PROGRESS BOOKING · <span className="capitalize">{item.concern_type.replaceAll("_", " ")}</span></div>
        <h2>{item.jobs?.title || "Home service booking"}</h2>
        <p>Customer: {item.profiles?.full_name || "Customer"}</p>
        <p>{item.reason}</p>
        <p className="form-hint">Submitted {new Date(item.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>
        <CancellationReviewActions requestId={item.id} />
      </article>)}
      <section className="request-card"><div className="eyebrow">REVIEW QUEUE</div><h2>{pending.length} submission{pending.length === 1 ? "" : "s"} awaiting review</h2><p>Review each identity document and separate selfie carefully before making a decision.</p></section>
      {error && <section className="request-card"><h2>We couldn't load submissions.</h2><p>{error.message}</p></section>}
      {!error && submissions.length === 0 && <section className="request-card completion"><h2>No verification submissions yet.</h2><p>New handyman applications will appear here after they submit their documents.</p></section>}
      {submissions.map(item => {
        const person = item.profiles;
        const files = documents.find(doc => doc.handymanId === item.handyman_id);
        return <article className="request-card" key={item.handyman_id}>
          <div className="eyebrow">SUBMISSION · <span className="capitalize">{item.status.replaceAll("_", " ")}</span></div>
          <h2>{person?.full_name || "Handyman applicant"}</h2>
          <p>{person?.phone || "No phone number supplied"}</p>
          <p className="form-hint">Submitted {new Date(item.submitted_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>
          <div className="button-row">
            {files?.idUrl ? <a className="btn btn-outline-dark" href={files.idUrl} target="_blank" rel="noreferrer">View identity document</a> : <span className="form-hint">Identity document unavailable</span>}
            {files?.selfieUrl ? <a className="btn btn-outline-dark" href={files.selfieUrl} target="_blank" rel="noreferrer">View selfie</a> : <span className="form-hint">Selfie unavailable</span>}
          </div>
          {item.status === "under_review" ? <VerificationActions handymanId={item.handyman_id} /> : <p className="privacy-note">This submission has already been reviewed.</p>}
        </article>;
      })}
    </div>
  </main>;
}
