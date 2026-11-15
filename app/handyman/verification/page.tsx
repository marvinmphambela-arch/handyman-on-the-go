import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import VerificationUpload from "../verification-upload";

export default async function HandymanVerificationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, verification_status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "handyman") redirect("/account");

  const { data: submission } = await supabase
    .from("handyman_verification_submissions")
    .select("status")
    .eq("handyman_id", user.id)
    .maybeSingle();

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/handyman" className="back-link">Back to dashboard</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">HANDYMAN VERIFICATION</div><h1>Verify your identity.</h1><p>Verification is compulsory before you can receive customer job requests or submit offers.</p></div>
      <VerificationUpload handymanId={user.id} existingStatus={submission?.status ?? null} />
    </div>
  </main>;
}
