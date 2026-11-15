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
    .select("full_name, role, phone, services, service_areas, years_experience, bio, available")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "handyman") redirect("/account");

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/account" className="back-link">My account</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">HANDYMAN WORKSPACE</div><h1>Your handyman dashboard.</h1><p>Set up your professional profile so customers can learn about your services.</p><div className="button-row"><Link className="btn btn-dark" href="/handyman/jobs">View job opportunities</Link><Link className="btn btn-outline-dark" href="/handyman/bookings">Confirmed bookings</Link></div></div>
      <HandymanProfileForm profile={profile} />
    </div>
  </main>;
}
