import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HandymanProfileForm from "./profile-form";

export default async function HandymanDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, phone, services, service_areas, years_experience, bio, available, verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "handyman") redirect("/account");

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/account" className="back-link">My account</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">HANDYMAN WORKSPACE</div><h1>Your handyman dashboard.</h1><p>Set up your professional profile so customers can learn about your services.</p><div className="button-row"><Link className="btn btn-dark" href="/handyman/verification">Submit identity verification</Link><Link className="btn btn-outline-dark" href="/handyman/jobs">View job opportunities</Link><Link className="btn btn-outline-dark" href="/handyman/bookings">Confirmed bookings</Link></div></div>
      <section className="request-card" aria-live="polite">
        <div className="eyebrow">VERIFICATION STATUS</div>
        <h2>{profile.verification_status === "approved" ? "Your account is approved" : profile.verification_status === "under_review" ? "Your documents are under review" : profile.verification_status === "rejected" ? "Your application was not approved" : profile.verification_status === "suspended" ? "Your account is suspended" : "Verification is pending"}</h2>
        <p>{profile.verification_status === "approved" ? "You are approved to receive matching job requests and submit offers." : profile.verification_status === "under_review" ? "Our team is reviewing your verification. You will receive a response within 12 hours of submitting your verification. You cannot receive job requests or submit offers until approval." : profile.verification_status === "rejected" ? "You cannot receive job requests or submit offers. Please contact support for information about the next steps." : profile.verification_status === "suspended" ? "Your access to job requests and offers is currently paused. Please contact support." : "Your account is waiting for verification. You will receive a response within 12 hours of submitting your verification. You cannot receive job requests or submit offers until an administrator approves your account."}</p>
      </section>
      <HandymanProfileForm profile={profile} />
    </div>
  </main>;
}
