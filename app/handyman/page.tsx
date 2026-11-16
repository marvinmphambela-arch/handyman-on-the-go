import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HandymanProfileForm from "./profile-form";
import HandymanOfferForm from "./offer-form";
import MarkEnRouteButton from "@/components/mark-en-route-button";
import StartWorkButton from "@/components/start-work-button";
import RealtimeRefresh from "@/components/realtime-refresh";
import StatusBadge from "@/components/status-badge";

type DashboardJob = {
  id: string;
  title: string;
  description: string;
  suburb: string | null;
  city: string;
  urgency: string;
  created_at: string;
  service_categories: { name: string } | { name: string }[] | null;
};

type ActiveBooking = {
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

type HandymanNotification = {
  id: string;
  title: string;
  message: string;
  created_at: string;
};

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

  const [opportunitiesResult, bookingsResult, notificationsResult] = await Promise.all([
    supabase.from("jobs")
      .select("id, title, description, suburb, city, urgency, created_at, service_categories(name)")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase.from("jobs")
      .select("id, title, description, street_address, suburb, city, urgency, status, handyman_en_route_at, created_at")
      .in("status", ["confirmed", "in_progress"])
      .order("created_at", { ascending: false }),
    supabase.from("handyman_notifications")
      .select("id, title, message, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const opportunities = (opportunitiesResult.data ?? []) as DashboardJob[];
  const bookings = (bookingsResult.data ?? []) as ActiveBooking[];
  const notifications = (notificationsResult.data ?? []) as HandymanNotification[];

  return <main className="request-page">
    <RealtimeRefresh />
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/account" className="back-link">My account</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading">
        <div className="eyebrow">HANDYMAN WORKSPACE</div>
        <h1>Your handyman dashboard.</h1>
        <p>See new opportunities, active bookings and important updates in one place.</p>
        <div className="button-row">
          <Link className="btn btn-dark" href="/handyman/verification">Identity verification</Link>
          <Link className="btn btn-outline-dark" href="/handyman/jobs">All job opportunities</Link>
          <Link className="btn btn-outline-dark" href="/handyman/bookings">Bookings view</Link>
        </div>
      </div>

      <section className="request-card" aria-live="polite">
        <div className="eyebrow">VERIFICATION STATUS</div>
        <h2>{profile.verification_status === "approved" ? "Your account is approved" : profile.verification_status === "under_review" ? "Your documents are under review" : profile.verification_status === "rejected" ? "Your application was not approved" : profile.verification_status === "suspended" ? "Your account is suspended" : "Verification is pending"}</h2>
        <p>{profile.verification_status === "approved" ? "You are approved to receive matching job requests and submit offers." : profile.verification_status === "under_review" ? "Our team is reviewing your verification. You cannot receive job requests or submit offers until approval." : profile.verification_status === "rejected" ? "You cannot receive job requests or submit offers. Please contact support." : profile.verification_status === "suspended" ? "Your access to job requests and offers is currently paused. Please contact support." : "Your account is waiting for verification. You cannot receive job requests or submit offers until an administrator approves your account."}</p>
      </section>

      <div className="section-heading"><div><div className="eyebrow">LIVE UPDATES</div><h2>Notifications ({notifications.length})</h2></div></div>
      {notifications.length === 0 ? <section className="request-card"><p className="privacy-note">No notifications yet. Important booking changes will appear here.</p></section> :
        <div className="job-list">{notifications.map(notification => <article className="request-card" key={notification.id}>
          <div className="eyebrow">{new Date(notification.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
          <h3>{notification.title}</h3><p>{notification.message}</p>
        </article>)}</div>}

      <div className="section-heading"><div><div className="eyebrow">YOUR WORK</div><h2>Active bookings ({bookings.length})</h2></div></div>
      {bookings.length === 0 ? <section className="request-card"><p className="privacy-note">No active bookings yet. When a customer accepts your offer, the booking will appear here automatically.</p></section> :
        <div className="job-list">{bookings.map(booking => <article className="request-card" key={booking.id}>
          <div className="eyebrow"><StatusBadge status={booking.status} /> · <span className="capitalize">{booking.urgency}</span></div>
          <h2>{booking.title}</h2><p>{booking.description}</p>
          <div className="review-summary">
            <div className="review-row"><small>EXACT JOB ADDRESS</small><b>{booking.street_address || "The customer has not supplied a street address."}</b></div>
            <div className="review-row"><small>AREA</small><b>{booking.suburb ? booking.suburb + ", " : ""}{booking.city}</b></div>
          </div>
          <p className="privacy-note">This address is visible only because your offer was accepted for this booking. Keep it private.</p>
          {booking.status === "in_progress" ? <p className="success-note">Work is marked as in progress.</p> : booking.handyman_en_route_at ? <><p className="success-note">You marked yourself as on the way at {new Date(booking.handyman_en_route_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.</p><StartWorkButton jobId={booking.id} /></> : <MarkEnRouteButton jobId={booking.id} />}
        </article>)}</div>}

      <div className="section-heading"><div><div className="eyebrow">AVAILABLE WORK</div><h2>New opportunities ({opportunities.length})</h2></div></div>
      {!profile.available && <section className="request-card"><h3>You are marked unavailable.</h3><p>Switch on your availability below to receive matching job opportunities.</p></section>}
      {profile.available && opportunities.length === 0 && <section className="request-card"><p className="privacy-note">No matching open jobs right now. New requests will appear here automatically.</p></section>}
      {profile.available && opportunities.length > 0 && <div className="job-list">{opportunities.map(job => {
        const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
        return <article className="request-card" key={job.id}>
          <div className="eyebrow">{category ?? "Home service"} · <span className="capitalize">{job.urgency}</span></div>
          <h3>{job.title}</h3><p>{job.description}</p>
          <p className="form-hint">{job.suburb ? job.suburb + ", " : ""}{job.city}</p>
          <p className="privacy-note">Customer contact details and exact street address are hidden to protect privacy.</p>
          <HandymanOfferForm jobId={job.id} />
        </article>;
      })}</div>}

      <div className="section-heading"><div><div className="eyebrow">YOUR PROFILE</div><h2>Professional details</h2></div></div>
      <HandymanProfileForm profile={profile} />
    </div>
  </main>;
}
