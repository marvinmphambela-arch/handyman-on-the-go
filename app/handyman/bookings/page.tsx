import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MarkEnRouteButton from "@/components/mark-en-route-button";

type Booking = {
  id: string;
  title: string;
  description: string;
  street_address: string | null;
  suburb: string | null;
  city: string;
  urgency: string;
  status: string;
  handyman_en_route_at: string | null;
  created_at: string;
};

export default async function HandymanBookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "handyman") redirect("/account");

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, description, street_address, suburb, city, urgency, status, handyman_en_route_at, created_at")
    .eq("status", "confirmed")
    .order("created_at", { ascending: false });

  const bookings = (data ?? []) as Booking[];

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/handyman" className="back-link">My profile</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">HANDYMAN WORKSPACE</div><h1>Confirmed bookings.</h1><p>Only jobs where your offer was accepted appear here. The exact address is private to you and the customer.</p></div>
      {error && <section className="request-card"><h2>We couldn't load your bookings.</h2><p>Please refresh the page. If this continues, contact support.</p></section>}
      {!error && bookings.length === 0 && <section className="request-card completion"><h2>No confirmed bookings yet.</h2><p>When a customer accepts one of your offers, the booking and its exact address will appear here.</p><Link href="/handyman/jobs" className="btn btn-orange">View job opportunities</Link></section>}
      {!error && bookings.length > 0 && <div className="job-list">{bookings.map(booking => <article className="request-card" key={booking.id}>
        <div className="eyebrow">CONFIRMED BOOKING · <span className="capitalize">{booking.urgency}</span></div>
        <h2>{booking.title}</h2>
        <p>{booking.description}</p>
        <div className="review-summary">
          <div className="review-row"><small>EXACT JOB ADDRESS</small><b>{booking.street_address || "The customer has not supplied a street address."}</b></div>
          <div className="review-row"><small>AREA</small><b>{booking.suburb ? booking.suburb + ", " : ""}{booking.city}</b></div>
        </div>
        <p className="privacy-note">This address is shown because your offer was accepted for this booking. Keep it private and use it only to complete the job.</p>
        {booking.handyman_en_route_at ? <p className="success-note">You marked yourself as on the way at {new Date(booking.handyman_en_route_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.</p> : <MarkEnRouteButton jobId={booking.id} />}
      </article>)}</div>}
    </div>
  </main>;
}
