import { redirect } from "next/navigation";
import Link from "next/link";
import { MapPin, Clock3, BriefcaseBusiness } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import HandymanOfferForm from "../offer-form";

type Job = {
  id: string;
  title: string;
  description: string;
  suburb: string | null;
  city: string;
  urgency: string;
  created_at: string;
  service_categories: { name: string } | { name: string }[] | null;
};

export default async function HandymanJobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, available")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "handyman") redirect("/account");

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, description, suburb, city, urgency, created_at, service_categories(name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as Job[];

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/handyman" className="back-link">My profile</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">HANDYMAN WORKSPACE</div><h1>Job opportunities.</h1><p>Open customer requests that match your services and your selected travel distance.</p></div>
      {!profile.available && <section className="request-card"><h2>You are marked unavailable.</h2><p>Switch on your availability in your handyman profile to receive matching job opportunities.</p><Link className="btn btn-dark" href="/handyman">Update my profile</Link></section>}
      {profile.available && error && <section className="request-card"><h2>We couldn't load job opportunities.</h2><p>Please refresh the page. If the problem continues, contact support.</p></section>}
      {profile.available && !error && jobs.length === 0 && <section className="request-card completion"><BriefcaseBusiness size={38}/><h2>No matching jobs yet.</h2><p>When a customer posts an open request within your selected travel distance and in one of your services, it will appear here. Your saved location must be refreshed within the last 24 hours.</p><Link className="btn btn-outline-dark" href="/handyman">Review my profile</Link></section>}
      {profile.available && !error && jobs.length > 0 && <div className="job-list">{jobs.map(job => {
        const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
        return <article className="request-card" key={job.id}>
          <div className="eyebrow">{category ?? "Home service"} · <span className="capitalize">{job.urgency}</span></div>
          <h2>{job.title}</h2>
          <p>{job.description}</p>
          <p className="form-hint"><MapPin size={15}/> {job.suburb ? job.suburb + ", " : ""}{job.city}</p>
          <p className="form-hint"><Clock3 size={15}/> Posted {new Date(job.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="privacy-note">Customer contact details and exact street address are hidden to protect privacy.</p>
          <HandymanOfferForm jobId={job.id} />
        </article>;
      })}</div>}
    </div>
  </main>;
}
