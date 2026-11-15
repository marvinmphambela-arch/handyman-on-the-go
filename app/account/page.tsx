import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AcceptOfferButton from "@/components/accept-offer-button";

type Offer = {
  id: string;
  amount_zar: number;
  message: string | null;
  estimated_arrival_minutes: number | null;
  status: string;
  created_at: string;
};

type Job = {
  id: string;
  title: string;
  description: string;
  suburb: string | null;
  city: string;
  urgency: string;
  status: string;
  created_at: string;
  service_categories: { name: string } | { name: string }[] | null;
  job_offers: Offer[];
};

function arrivalLabel(minutes: number | null) {
  if (!minutes) return "Arrival estimate not provided";
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "handyman") redirect("/handyman");

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, description, suburb, city, urgency, status, created_at, service_categories(name), job_offers(id, amount_zar, message, estimated_arrival_minutes, status, created_at)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as Job[];

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/request" className="btn btn-orange">Post a job</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">CUSTOMER DASHBOARD</div><h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}.</h1><p>Compare handyman offers and choose the one that works best for you.</p></div>
      <div className="section-heading"><div><div className="eyebrow">YOUR HOME SERVICES</div><h2>My job requests</h2></div><Link href="/request" className="text-link">Post another job</Link></div>
      {error && <section className="request-card"><h2>We couldn't load your requests.</h2><p>Please refresh the page. If this continues, contact support.</p></section>}
      {!error && jobs.length === 0 && <section className="request-card completion"><h2>No job requests yet.</h2><p>When you post a home service request, it will appear here with any offers from handymen.</p><Link href="/request" className="btn btn-orange">Post your first job</Link></section>}
      {!error && jobs.length > 0 && <div className="job-list">{jobs.map(job => {
        const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
        const offers = job.job_offers ?? [];
        const acceptedOffer = offers.find(offer => offer.status === "accepted");
        const canChoose = job.status === "open" && !acceptedOffer;
        return <article className="request-card" key={job.id}>
          <div className="eyebrow">{category ?? "Home service"} · <span className="capitalize">{job.status.replaceAll("_", " ")}</span></div>
          <h2>{job.title}</h2>
          <p>{job.description}</p>
          <p className="form-hint">{job.suburb ? job.suburb + ", " : ""}{job.city} · {job.urgency}</p>
          <div className="section-heading"><div><h3>Compare offers ({offers.length})</h3></div></div>
          {offers.length === 0 ? <p className="privacy-note">No offers yet. New offers will appear here when handymen respond.</p> :
            <div className="job-list">{offers.map(offer => <div className="review-summary" key={offer.id}>
              <div className="review-row"><small>OFFER PRICE</small><b>R{offer.amount_zar.toLocaleString("en-ZA")}</b></div>
              <div className="review-row"><small>ESTIMATED ARRIVAL</small><b>{arrivalLabel(offer.estimated_arrival_minutes)}</b></div>
              <div className="review-row"><small>OFFER STATUS</small><b className="capitalize">{offer.status}</b></div>
              {offer.message && <p>{offer.message}</p>}
              {offer.status === "accepted" && <p className="success-note">This offer is accepted. Your booking is confirmed.</p>}
              {canChoose && offer.status === "pending" && <AcceptOfferButton offerId={offer.id} />}
            </div>)}</div>}
          {job.status === "confirmed" && <p className="privacy-note">Your booking is confirmed. Handyman contact and job coordination are the next steps.</p>}
          {job.status !== "open" && job.status !== "confirmed" && <p className="privacy-note">This job is no longer accepting offers.</p>}
        </article>;
      })}</div>}
    </div>
  </main>;
}
