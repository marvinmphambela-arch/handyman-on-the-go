import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RealtimeRefresh from "@/components/realtime-refresh";
import AcceptOfferButton from "@/components/accept-offer-button";
import DeclineOfferButton from "@/components/decline-offer-button";
import CancelBookingButton from "@/components/cancel-booking-button";
import FindReplacementHandyman from "@/components/find-replacement-handyman";
import StatusBadge from "@/components/status-badge";
import ConfirmJobCompletionButton from "@/components/confirm-job-completion-button";
import SharedNotificationCenter from "@/components/shared-notification-center";
import CustomerProfileForm from "./customer-profile-form";

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
  street_address: string | null;
  city: string;
  urgency: string;
  status: string;
  handyman_en_route_at: string | null;
  cancellation_reason: string | null;
  cancellation_compensation_zar: number | null;
  replacement_handyman_decision: string;
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
    .select("full_name, phone, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "handyman") redirect("/handyman");
  if (profile?.role === "admin") redirect("/admin");

  const { data, error } = await supabase
    .from("jobs")
    .select("id, title, description, suburb, street_address, city, urgency, status, handyman_en_route_at, cancellation_reason, cancellation_compensation_zar, replacement_handyman_decision, created_at, service_categories(name), job_offers(id, amount_zar, message, estimated_arrival_minutes, status, created_at)")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[customer-dashboard] Failed to load customer jobs", {
      userId: user.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }

  const jobs = (data ?? []) as Job[];

  return <main className="request-page">
    <RealtimeRefresh />
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/request" className="btn btn-orange">Post a job</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">CUSTOMER DASHBOARD</div><h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}.</h1><p>Compare handyman offers and choose the one that works best for you.</p></div>
      <CustomerProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} email={user.email ?? ""} />
      <SharedNotificationCenter role="customer" />
      <div className="section-heading"><div><div className="eyebrow">YOUR HOME SERVICES</div><h2>My job requests</h2></div><Link href="/request" className="btn btn-orange">Post another job</Link></div>
      {error && <section className="request-card"><h2>We couldn't load your requests.</h2><p>Please refresh the page. If this continues, contact support.</p></section>}
      {!error && jobs.length === 0 && <section className="request-card completion"><h2>No job requests yet.</h2><p>When you post a home service request, it will appear here with any offers from handymen.</p><Link href="/request" className="btn btn-orange">Post your first job</Link></section>}
      {!error && jobs.length > 0 && (() => {
        const groups = [
          { title: "Open requests", description: "Review handyman offers and compare prices.", statuses: ["open"] },
          { title: "Confirmed bookings", description: "View confirmed booking details and available actions.", statuses: ["confirmed"] },
          { title: "Jobs in progress", description: "Follow active work and confirm completion when ready.", statuses: ["in_progress"] },
          { title: "Completed & cancelled", description: "Your previous jobs and booking history.", statuses: ["completed", "cancelled"] },
        ];
        return <div className="customer-job-groups">{groups.map((group, groupIndex) => {
          const groupJobs = jobs.filter(job => group.statuses.includes(job.status));
          if (groupJobs.length === 0) return null;
          return <details className="customer-job-group" key={group.title} open={groupIndex === 0}>
            <summary className="customer-group-summary">
              <span className="customer-group-copy"><strong>{group.title}</strong><small>{group.description}</small></span>
              <span className="customer-group-count">{groupJobs.length}</span>
              <span className="customer-group-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="customer-group-content">{groupJobs.map(job => {
              const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
              const offers = job.job_offers ?? [];
              const acceptedOffer = offers.find(offer => offer.status === "accepted");
              const canChoose = job.status === "open" && !acceptedOffer;
              return <article className="request-card customer-job-card" id={`job-${job.id}`} key={job.id}>
                <div className="customer-job-topline"><div className="eyebrow">{category ?? "Home service"}</div><StatusBadge status={job.status} /></div>
                <h3 className="customer-job-title">{job.title}</h3>
                <p className="customer-job-location">{job.suburb ? job.suburb + ", " : ""}{job.city} · {job.urgency}</p>
                <details className="customer-job-details">
                  <summary>View job details and actions</summary>
                  <div className="customer-job-detail-content">
                    <p>{job.description}</p>
                    <div className="section-heading"><div><h3>Compare offers ({offers.length})</h3></div></div>
                    {offers.length === 0 ? <p className="privacy-note">No offers yet. New offers will appear here when handymen respond.</p> :
                      <div className="job-list">{offers.map(offer => <div className="review-summary" key={offer.id}>
                        <div className="review-row"><small>OFFER PRICE</small><b>R{offer.amount_zar.toLocaleString("en-ZA")}</b></div>
                        <div className="review-row"><small>ESTIMATED ARRIVAL</small><b>{arrivalLabel(offer.estimated_arrival_minutes)}</b></div>
                        <div className="review-row"><small>OFFER STATUS</small><b className="capitalize">{offer.status}</b></div>
                        {offer.message && <p>{offer.message}</p>}
                        {offer.status === "accepted" && <p className="success-note">This offer is accepted. Your booking is confirmed.</p>}
                        {canChoose && (offer.status === "pending" || offer.status === "countered") && <div className="offer-decision-actions"><AcceptOfferButton offerId={offer.id} /><DeclineOfferButton offerId={offer.id} /></div>}
                      </div>)}</div>}
                    {job.status === "confirmed" && <><p className="success-note">Your booking is confirmed.</p><div className="review-summary"><div className="review-row"><small>YOUR JOB ADDRESS</small><b>{job.street_address || "No street address was supplied."}</b></div></div><p className="privacy-note">You may cancel before work starts. If the handyman has marked themselves as on the way, a fixed R250 travel compensation will be recorded for them.</p>{job.handyman_en_route_at && <p className="success-note">The handyman marked themselves as on the way at {new Date(job.handyman_en_route_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.</p>}<CancelBookingButton jobId={job.id} enRoute={Boolean(job.handyman_en_route_at)} /></>}
                    {job.status === "in_progress" && <><p className="success-note">The handyman has marked this job as in progress. You can confirm completion after the work is finished and paid for.</p><ConfirmJobCompletionButton jobId={job.id} /><CancelBookingButton jobId={job.id} enRoute={Boolean(job.handyman_en_route_at)} inProgress /></>}
                    {job.status === "completed" && <><p className="success-note">This job has been marked completed. The 10% platform commission was recorded against the handyman’s Access Wallet.</p><Link href={`/account/receipt/${job.id}`} className="btn btn-orange">View service receipt</Link></>}
                    {job.status === "cancelled" && <><p className="privacy-note">This booking has been cancelled. It remains in your job history.</p>{job.cancellation_reason && <p>Cancellation reason: {job.cancellation_reason}</p>}{(job.cancellation_compensation_zar ?? 0) > 0 && <p className="success-note">R{job.cancellation_compensation_zar} travel compensation has been recorded for the handyman. Payment collection is not yet automated.</p>}{job.replacement_handyman_decision === "not_offered" && <FindReplacementHandyman jobId={job.id} />}{job.replacement_handyman_decision === "accepted" && <p className="success-note">You asked us to find another handyman. This same request is open for new offers.</p>}{job.replacement_handyman_decision === "declined" && <p className="privacy-note">You chose not to look for another handyman.</p>}</>}
                    {job.status !== "open" && job.status !== "confirmed" && job.status !== "in_progress" && job.status !== "completed" && <p className="privacy-note">This job is no longer accepting offers.</p>}
                  </div>
                </details>
              </article>;
            })}</div>
          </details>;
        })}</div>;
      })()}
    </div>
  </main>;
}
