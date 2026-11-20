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

function AdminSection({
  id, eyebrow, title, description, accent = "#0759a8", open = false, children
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  accent?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return <details id={id} className="admin-section" open={open}>
    <summary style={{
      listStyle: "none", cursor: "pointer", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: 16, padding: "18px 22px",
      color: "#fff", background: accent, borderRadius: 14
    }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 10, fontWeight: 750, letterSpacing: "1.5px", opacity: .82 }}>{eyebrow}</span>
        <span style={{ display: "block", fontSize: 19, fontWeight: 750, marginTop: 3 }}>{title}</span>
        <span style={{ display: "block", fontSize: 13, opacity: .9, marginTop: 3 }}>{description}</span>
      </span>
      <span aria-hidden="true" style={{
        flex: "0 0 34px", width: 34, height: 34, borderRadius: 10,
        display: "grid", placeItems: "center", background: "rgba(255,255,255,.16)",
        fontSize: 21, fontWeight: 700
      }}>⌄</span>
    </summary>
    <div style={{ padding: "20px 4px 4px" }}>{children}</div>
  </details>;
}

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

  const navItems = [
    ["overview", "Platform overview"],
    ["accounts", "Account management"],
    ["verification", "Handyman verification"],
    ["cancellations", "Cancellation requests"],
    ["jobs-bookings", "Jobs & bookings"]
  ];

  return <main className="request-page" style={{ minHeight: "100vh", background: "#f7f8fa" }}>
    <header style={{ background: "#082d59", color: "#fff", borderBottom: "4px solid #f58220" }}>
      <div className="container" style={{ minHeight: 78, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", paddingTop: 12, paddingBottom: 12 }}>
        <Link className="brand" href="/" style={{ color: "#fff" }}>
          <span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span>
          <span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span>
        </Link>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: "1.7px", fontWeight: 750, color: "#b9d5f4" }}>SECURE ADMINISTRATION</div>
          <div style={{ fontSize: 17, fontWeight: 750 }}>Administrator workspace</div>
        </div>
      </div>
    </header>

    <div className="container" style={{ display: "grid", gridTemplateColumns: "minmax(190px, 225px) minmax(0, 1fr)", gap: 24, alignItems: "start", paddingTop: 28, paddingBottom: 48 }}>
      <aside style={{ background: "#fff", border: "1px solid #dce6f2", borderRadius: 16, padding: 16, boxShadow: "0 8px 24px rgba(8,45,89,.06)", position: "sticky", top: 18 }}>
        <div style={{ fontSize: 10, letterSpacing: "1.5px", fontWeight: 800, color: "#71839a", padding: "4px 10px 12px" }}>ADMIN MENU</div>
        <nav aria-label="Admin dashboard sections" style={{ display: "grid", gap: 6 }}>
          {navItems.map(([id, label], index) => <a key={id} href={`#${id}`} style={{
            textDecoration: "none", borderRadius: 9, padding: "11px 10px",
            color: index === 0 ? "#fff" : "#17385f",
            background: index === 0 ? "#0866c6" : "transparent",
            fontWeight: 700, fontSize: 13
          }}>{label}</a>)}
        </nav>
        <div style={{ borderTop: "1px solid #e6edf5", marginTop: 16, padding: "16px 10px 4px" }}>
          <div style={{ color: "#0b3768", fontWeight: 750, fontSize: 13 }}>Admin access</div>
          <div style={{ color: "#71839a", fontSize: 12, marginTop: 3 }}>Authorised personnel only</div>
        </div>
        <Link href="/account" className="back-link" style={{ display: "block", margin: "18px 10px 4px" }}>Back to my account</Link>
      </aside>

      <div style={{ minWidth: 0, display: "grid", gap: 18 }}>
        <div style={{ padding: "4px 2px 2px" }}>
          <div className="eyebrow" style={{ color: "#ed7b19" }}>ADMINISTRATION / CONTROL CENTRE</div>
          <h1 style={{ color: "#082d59", fontSize: "clamp(26px, 3vw, 34px)", margin: "5px 0 6px" }}>Admin Dashboard</h1>
          <p style={{ color: "#62748a", margin: 0 }}>Monitor the marketplace and manage platform operations from one place.</p>
        </div>

        <AdminSection id="overview" eyebrow="01 · PLATFORM" title="Platform Overview" description="Marketplace performance and verified payment totals" accent="#07549a" open>
          {statsError ? <p role="alert">Platform statistics could not be loaded: {statsError.message}</p> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
            {[
              ["Customers", overview?.customers ?? 0, "#e8f2ff", "#0866c6"],
              ["Handymen", overview?.handymen ?? 0, "#e8f7ef", "#16834b"],
              ["Jobs posted", overview?.jobs_posted ?? 0, "#fff1e5", "#e87516"],
              ["Open jobs", overview?.open_jobs ?? 0, "#edf0ff", "#4b55b7"],
              ["Active bookings", overview?.active_bookings ?? 0, "#e8f2ff", "#0866c6"],
              ["Completed jobs", overview?.completed_jobs ?? 0, "#e8f7ef", "#16834b"],
              ["Cancelled & other-status jobs", (overview?.cancelled_jobs ?? 0) + (overview?.other_jobs ?? 0), "#fff1e5", "#e87516"]
            ].map(([label, value, background, color]) => <div key={String(label)} style={{ padding: 16, border: "1px solid #e1eaf4", borderRadius: 13, background: String(background) }}>
              <div style={{ color: "#52647a", fontSize: 11, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".7px" }}>{label}</div>
              <div style={{ color: String(color), fontSize: 27, fontWeight: 800, marginTop: 5 }}>{value}</div>
            </div>)}
            <div style={{ padding: 16, border: "1px solid #e1eaf4", borderRadius: 13, background: "#fff" }}>
              <div className="eyebrow">Verified customer payments</div>
              <div style={{ color: "#073b78", fontSize: 25, fontWeight: 800, marginTop: 5 }}>R{verifiedPaymentsTotal.toLocaleString("en-ZA")}</div>
              <p className="form-hint">Successful paid job payments only; not platform revenue.</p>
            </div>
          </div>}
        </AdminSection>

        <AdminSection id="accounts" eyebrow="02 · PEOPLE" title="Account Management" description="Manage customer and handyman accounts" accent="#07549a">
          {accountManagementError
            ? <section className="request-card"><h2>Account directory could not be loaded.</h2><p>{accountManagementError.message}</p></section>
            : <AccountManagement customers={customerAccounts} handymen={handymanAccounts} />}
        </AdminSection>

        <AdminSection id="jobs-bookings" eyebrow="03 · MARKETPLACE" title="Jobs & Bookings" description="Search and inspect jobs, accepted handymen, offers and payment records" accent="#07549a">
          <JobsBookingsManagement />
        </AdminSection>

        <AdminSection id="cancellations" eyebrow="04 · CUSTOMER PROTECTION" title="Cancellation Requests" description={`${cancellationRequests?.length ?? 0} request(s) awaiting review`} accent="#07549a">
          {cancellationError && <section className="request-card"><h2>Could not load cancellation reviews.</h2><p>{cancellationError.message}</p></section>}
          {!cancellationError && (cancellationRequests ?? []).length === 0 && <p className="form-hint">There are no cancellation requests awaiting review.</p>}
          {(cancellationRequests ?? []).map((item: any) => <article className="request-card" key={item.id}>
            <div className="eyebrow">IN-PROGRESS BOOKING · <span className="capitalize">{item.concern_type.replaceAll("_", " ")}</span></div>
            <h2>{item.jobs?.title || "Home service booking"}</h2>
            <p>Customer: {item.profiles?.full_name || "Customer"}</p>
            <p>{item.reason}</p>
            <p className="form-hint">Submitted {new Date(item.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>
            <CancellationReviewActions requestId={item.id} />
          </article>)}
        </AdminSection>

        <AdminSection id="verification" eyebrow="05 · TRUST & SAFETY" title="Handyman Verification" description={`${pending.length} submission(s) awaiting review · identity documents and selfies`} accent="#07549a">
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
        </AdminSection>
      </div>
    </div>
    <style>{`
      .admin-section { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 8px; box-shadow: 0 4px 16px rgba(20,40,70,.045); }
      .admin-section > summary::-webkit-details-marker { display: none; }
      .admin-section > summary::marker { content: ""; }
      .admin-section[open] > summary { border-radius: 12px 12px 8px 8px !important; }
      .admin-section > div { padding-left: 10px !important; padding-right: 10px !important; }
      @media (max-width: 760px) {
        .request-page .container { grid-template-columns: 1fr !important; }
        .request-page aside { position: static !important; }
        .request-page aside nav { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
      }
    `}</style>
  </main>;
}
