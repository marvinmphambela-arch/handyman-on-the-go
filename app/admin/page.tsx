import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VerificationActions from "./verification-actions";

type Submission = {
  handyman_id: string;
  id_document_path: string;
  selfie_path: string;
  status: string;
  submitted_at: string;
  profiles: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
};

export default async function AdminDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/account");

  const { data, error } = await supabase
    .from("handyman_verification_submissions")
    .select("handyman_id, id_document_path, selfie_path, status, submitted_at, profiles(full_name, phone)")
    .order("submitted_at", { ascending: true });

  const submissions = (data ?? []) as Submission[];
  const pending = submissions.filter(item => item.status === "under_review");

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
      <section className="request-card"><div className="eyebrow">REVIEW QUEUE</div><h2>{pending.length} submission{pending.length === 1 ? "" : "s"} awaiting review</h2><p>Review each identity document and separate selfie carefully before making a decision.</p></section>
      {error && <section className="request-card"><h2>We couldn't load submissions.</h2><p>{error.message}</p></section>}
      {!error && submissions.length === 0 && <section className="request-card completion"><h2>No verification submissions yet.</h2><p>New handyman applications will appear here after they submit their documents.</p></section>}
      {submissions.map(item => {
        const person = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
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
