import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HandymanProfileForm from "./profile-form";
import HandymanOfferForm from "./offer-form";
import MarkEnRouteButton from "@/components/mark-en-route-button";
import StartWorkButton from "@/components/start-work-button";
import RealtimeRefresh from "@/components/realtime-refresh";
import StatusBadge from "@/components/status-badge";
import HandymanDashboardTabs from "@/components/handyman-dashboard-tabs";
import AccessWalletTopup from "@/components/access-wallet-topup";
import HandymanBankAccountForm from "./bank-account-form";
import JobRadarSearch from "@/components/job-radar-search";
import InstantWithdrawal from "./instant-withdrawal";

type DashboardJob = {
  id: string;
  title: string;
  description: string;
  suburb: string | null;
  city: string;
  urgency: string;
  payment_method: string | null;
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

type WalletTransaction = {
  id: string;
  transaction_type: string;
  direction: string;
  amount_zar: number;
  status: string;
  description: string | null;
  created_at: string;
};

type EarningsRecord = {
  id: string;
  job_id: string;
  labour_amount_zar: number;
  commission_total_zar: number;
  commission_wallet_amount_zar: number;
  commission_shortfall_zar: number;
  commission_carryforward_deducted_zar: number;
  commission_amount_zar: number;
  net_earnings_zar: number;
  payment_method: string;
  status: string;
  completed_at: string;
};

type PayoutRecord = {
  id: string;
  payout_type: string;
  gross_amount_zar: number;
  fee_amount_zar: number;
  net_amount_zar: number;
  status: string;
  requested_at: string;
};

type HandymanNotification = {
  id: string;
  title: string;
  message: string;
  job_title: string | null;
  service_name: string | null;
  cancellation_reason: string | null;
  compensation_zar: number | null;
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

  const [opportunitiesResult, rejectedOffersResult, bookingsResult, notificationsResult, walletResult, walletTransactionsResult, earningsResult, payoutsResult, carryforwardsResult, earningsSummaryResult] = await Promise.all([
    supabase.from("jobs")
      .select("id, title, description, suburb, city, urgency, payment_method, created_at, service_categories(name)")
      .eq("status", "open")
      .order("created_at", { ascending: false }),
    supabase.from("job_offers")
      .select("job_id")
      .eq("handyman_id", user.id)
      .eq("status", "rejected"),
    supabase.from("jobs")
      .select("id, title, description, street_address, suburb, city, urgency, status, handyman_en_route_at, created_at")
      .in("status", ["confirmed", "in_progress"])
      .order("created_at", { ascending: false }),
    supabase.from("handyman_notifications")
      .select("id, title, message, job_title, service_name, cancellation_reason, compensation_zar, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("handyman_access_wallets").select("balance_zar").eq("handyman_id", user.id).maybeSingle(),
    supabase.from("handyman_access_wallet_transactions").select("id, transaction_type, direction, amount_zar, status, description, created_at").eq("handyman_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("handyman_earnings").select("id, job_id, labour_amount_zar, commission_total_zar, commission_wallet_amount_zar, commission_shortfall_zar, commission_carryforward_deducted_zar, commission_amount_zar, net_earnings_zar, payment_method, status, completed_at").eq("handyman_id", user.id).order("completed_at", { ascending: false }).limit(20),
    supabase.from("handyman_payout_requests").select("id, payout_type, gross_amount_zar, fee_amount_zar, net_amount_zar, status, requested_at").eq("handyman_id", user.id).order("requested_at", { ascending: false }).limit(10),
    supabase.from("handyman_commission_carryforwards").select("remaining_amount_zar").eq("handyman_id", user.id).gt("remaining_amount_zar", 0),
    supabase.rpc("get_handyman_earnings_summary", { p_handyman_id: user.id })
  ]);

  const rejectedJobIds = [...new Set((rejectedOffersResult.data ?? []).map(offer => offer.job_id))];
  const rejectedJobsResult = rejectedJobIds.length > 0
    ? await supabase.from("jobs")
        .select("id, title, description, suburb, city, urgency, created_at, service_categories(name)")
        .in("id", rejectedJobIds)
        .order("created_at", { ascending: false })
    : { data: [] as DashboardJob[] };
  const rejectedJobs = (rejectedJobsResult.data ?? []) as DashboardJob[];
  const rejectedJobIdSet = new Set(rejectedJobIds);
  const opportunities = ((opportunitiesResult.data ?? []) as DashboardJob[])
    .filter(job => !rejectedJobIdSet.has(job.id));
  const bookings = (bookingsResult.data ?? []) as ActiveBooking[];
  const notifications = (notificationsResult.data ?? []) as HandymanNotification[];
  const accessWalletBalance = walletResult.data?.balance_zar ?? 0;
  const walletTransactions = (walletTransactionsResult.data ?? []) as WalletTransaction[];
  const earnings = (earningsResult.data ?? []) as EarningsRecord[];
  const payouts = (payoutsResult.data ?? []) as PayoutRecord[];
  const outstandingCommission = (carryforwardsResult.data ?? []).reduce((sum, item) => sum + Number(item.remaining_amount_zar || 0), 0);
  const earningsSummary = (earningsSummaryResult.data ?? {}) as {
    platform_held_zar?: number; platform_paid_zar?: number; direct_payment_zar?: number;
    week_total_zar?: number; week_platform_zar?: number; week_direct_zar?: number;
    daily?: { day: string; total_zar: number; platform_zar: number; direct_zar: number }[];
  };
  const platformHeldEarnings = Number(earningsSummary.platform_held_zar ?? 0);
  const instantEligibleEarnings = earnings
    .filter(item => item.payment_method === "platform" && ["held", "available"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.net_earnings_zar || 0), 0);
  const paidEarnings = Number(earningsSummary.platform_paid_zar ?? 0);
  const directEftEarnings = Number(earningsSummary.direct_payment_zar ?? 0);
  const weeklyDaily = earningsSummary.daily ?? [];
  const weeklyMax = Math.max(1, ...weeklyDaily.map(day => Number(day.total_zar || 0)));

  return <main className="request-page">
    <RealtimeRefresh />
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/account" className="back-link">My account</Link>
    </div></header>
    <div className="container request-shell">
      <HandymanDashboardTabs
        home={<>
<div className="request-heading" id="dashboard-home">
        <div className="eyebrow">HANDYMAN WORKSPACE</div>
        <h1>Your handyman dashboard.</h1>
        <p>See new opportunities, active bookings and important updates in one place.</p>
        <div className="button-row"><Link className="btn btn-dark" href="/handyman/verification">Identity verification</Link></div>
      </div>

      <JobRadarSearch
        verificationStatus={profile.verification_status ?? "pending"}
        available={Boolean(profile.available)}
        opportunitiesCount={opportunities.length}
      />
<div className="section-heading" id="new-jobs"><div><div className="eyebrow">AVAILABLE WORK</div><h2>New opportunities ({opportunities.length})</h2></div></div>
      {!profile.available && <section className="request-card"><h3>You are marked unavailable.</h3><p>Switch on your availability below to receive matching job opportunities.</p></section>}
      {profile.available && opportunities.length === 0 && <section className="request-card"><p className="privacy-note">No matching open jobs right now. New requests will appear here automatically.</p></section>}
      {profile.available && opportunities.length > 0 && <div className="job-list">{opportunities.map(job => {
        const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
        return <article className="request-card" key={job.id}>
          <div className="eyebrow">{category ?? "Home service"} · <span className="capitalize">{job.urgency}</span></div>
          <h3>{job.title}</h3>
          <div className={`payment-method-badge ${job.payment_method === "platform" ? "payment-method-platform" : "payment-method-direct"}`}><span className="payment-method-icon" aria-hidden="true">{job.payment_method === "platform" ? "💳" : "🏦"}</span><span>{job.payment_method === "platform" ? "Platform Payment" : "Direct EFT"}</span></div><p>{job.description}</p>
          <p className="form-hint">{job.suburb ? job.suburb + ", " : ""}{job.city}</p>
          <p className="privacy-note">Customer contact details and exact street address are hidden to protect privacy.</p>
          <HandymanOfferForm jobId={job.id} />
        </article>;
      })}</div>}
        </>}
        bookings={<>
<div className="section-heading" id="my-bookings"><div><div className="eyebrow">YOUR WORK</div><h2>Active bookings ({bookings.length})</h2></div></div>
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
      <div className="section-heading"><div><div className="eyebrow">PREVIOUS OFFERS</div><h2>Previous offers ({rejectedJobs.length})</h2></div></div>
      {rejectedJobs.length === 0 ? <section className="request-card"><p className="privacy-note">Jobs you decline will be listed here for your reference.</p></section> :
        <div className="job-list">{rejectedJobs.map(job => {
          const category = Array.isArray(job.service_categories) ? job.service_categories[0]?.name : job.service_categories?.name;
          return <article className="request-card" key={job.id}>
            <div className="eyebrow"><StatusBadge status="rejected" /> · {category ?? "Home service"}</div>
            <h3>{job.title}</h3><p>{job.description}</p>
            <p className="form-hint">{job.suburb ? job.suburb + ", " : ""}{job.city}</p>
            <p className="privacy-note">You previously declined this job. It is shown here for reference only and is not available for a new offer.</p>
          </article>;
        })}</div>}
        </>}
        cancellations={<>
<div className="section-heading" id="cancellations"><div><div className="eyebrow">CANCELLATIONS</div><h2>Notifications ({notifications.length})</h2></div></div>
      {notifications.length === 0 ? <section className="request-card"><p className="privacy-note">No notifications yet. Important booking changes will appear here.</p></section> :
        <div className="job-list">{notifications.map(notification => <article className="request-card" key={notification.id}>
          <div className="eyebrow">{new Date(notification.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
          <h3>{notification.title}</h3><p>{notification.message}</p>
          <div className="review-summary">
            <div className="review-row"><small>JOB</small><b>{notification.job_title || "Job details unavailable"}</b></div>
            <div className="review-row"><small>SERVICE</small><b>{notification.service_name || "Not recorded"}</b></div>
            <div className="review-row"><small>CUSTOMER'S REASON</small><b>{notification.cancellation_reason || "No reason was recorded."}</b></div>
            <div className="review-row"><small>CALL-OUT COMPENSATION RECORDED</small><b>{notification.compensation_zar && notification.compensation_zar > 0 ? `R${notification.compensation_zar.toLocaleString("en-ZA")}` : "R0 — none recorded"}</b></div>
          </div>
          <p className="privacy-note">The customer's exact street address is not shown in cancellation notices.</p>
        </article>)}</div>}
        </>}
        earnings={<>
<div className="section-heading"><div><div className="eyebrow">YOUR MONEY</div><h2>Earnings</h2></div></div>
<section className="request-card earnings-week-card">
  <div className="eyebrow">THIS WEEK · MONDAY TO SUNDAY</div>
  <h2>R{Number(earningsSummary.week_total_zar ?? 0).toLocaleString("en-ZA")}</h2>
  <div className="earnings-week-split">
    <div><small>PLATFORM</small><b>R{Number(earningsSummary.week_platform_zar ?? 0).toLocaleString("en-ZA")}</b></div>
    <div><small>DIRECT</small><b>R{Number(earningsSummary.week_direct_zar ?? 0).toLocaleString("en-ZA")}</b></div>
  </div>
  <div className="earnings-chart">
    {weeklyDaily.map((day, index) => <div className="earnings-chart-day" key={day.day}>
      <small>R{Math.round(Number(day.total_zar || 0)).toLocaleString("en-ZA")}</small>
      <div title={`R${Number(day.total_zar || 0).toLocaleString("en-ZA")}`} className="earnings-chart-track"><span style={{height:`${Math.max(4,Number(day.total_zar || 0)/weeklyMax*72)}px`}} /></div>
      <small>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</small>
    </div>)}
  </div>
  <details className="earnings-details earnings-daily-details">
    <summary>Daily breakdown</summary>
    {weeklyDaily.map(day => <div className="earnings-compact-row" key={day.day}>
      <span>{new Date(day.day).toLocaleDateString("en-ZA", { weekday:"short", day:"numeric", month:"short", timeZone:"Africa/Johannesburg" })}</span>
      <b>R{Number(day.total_zar || 0).toLocaleString("en-ZA")}</b>
      <small>Platform R{Number(day.platform_zar || 0).toLocaleString("en-ZA")} · Direct R{Number(day.direct_zar || 0).toLocaleString("en-ZA")}</small>
    </div>)}
  </details>
</section>

<div className="earnings-balance-grid">
  <section className="request-card earnings-balance-card"><small>PLATFORM AVAILABLE</small><h3>R{platformHeldEarnings.toLocaleString("en-ZA")}</h3></section>
  <section className="request-card earnings-balance-card"><small>PAID OUT</small><h3>R{paidEarnings.toLocaleString("en-ZA")}</h3></section>
  <section className="request-card earnings-balance-card"><small>ACCESS WALLET</small><h3>R{accessWalletBalance.toLocaleString("en-ZA")}</h3></section>
  <section className="request-card earnings-balance-card"><small>DIRECT PAYMENT EARNINGS</small><h3>R{directEftEarnings.toLocaleString("en-ZA")}</h3></section>
  <section className="request-card earnings-balance-card"><small>OUTSTANDING COMMISSION</small><h3>R{outstandingCommission.toLocaleString("en-ZA")}</h3></section>
</div>

<InstantWithdrawal availableAmount={instantEligibleEarnings} />

<details className="earnings-details earnings-section-details">
  <summary>Access Wallet <span>Top up and view recent activity</span></summary>
  <section className="request-card earnings-inner-card">
    <p>Use your Access Wallet to keep your account ready for offers.</p>
    <AccessWalletTopup />
  </section>
  {walletTransactions.length === 0 ? <p className="privacy-note">No wallet transactions yet.</p> : walletTransactions.map(item => <div className="earnings-compact-row" key={item.id}>
    <span>{item.description || item.transaction_type.replaceAll("_", " ")}</span>
    <b>{item.direction === "credit" ? "+" : "−"}R{item.amount_zar.toLocaleString("en-ZA")}</b>
    <small>{new Date(item.created_at).toLocaleString("en-ZA", { dateStyle:"medium", timeStyle:"short" })} · <span className="capitalize">{item.status}</span></small>
  </div>)}
</details>

<details className="earnings-details earnings-section-details">
  <summary>Completed job earnings <span>{earnings.length} recent records</span></summary>
  {earnings.length === 0 ? <p className="privacy-note">Completed-job earnings will appear here.</p> : earnings.map(item => <article className="earnings-job-row" key={item.id}>
    <div className="earnings-job-main">
      <div><b>{new Date(item.completed_at).toLocaleDateString("en-ZA", { dateStyle:"medium" })}</b><small>{item.payment_method === "direct_eft" ? "Direct payment" : "Platform payment"} · <span className="capitalize">{item.status.replaceAll("_", " ")}</span></small></div>
      <strong>R{item.net_earnings_zar.toLocaleString("en-ZA")}</strong>
    </div>
    <details className="earnings-details earnings-breakdown">
      <summary>View earnings breakdown</summary>
      <div className="earnings-compact-row"><span>Labour</span><b>R{item.labour_amount_zar.toLocaleString("en-ZA")}</b></div>
      <div className="earnings-compact-row"><span>Net earnings</span><b>R{item.net_earnings_zar.toLocaleString("en-ZA")}</b></div>
    </details>
  </article>)}
</details>

<details className="earnings-details earnings-section-details">
  <summary>Payout history <span>{payouts.length} recent records</span></summary>
  {payouts.length === 0 ? <p className="privacy-note">No payout requests yet.</p> : payouts.map(item => <div className="earnings-compact-row" key={item.id}>
    <span>{item.payout_type === "instant" ? "Instant withdrawal" : "Weekly payout"}<small>{new Date(item.requested_at).toLocaleString("en-ZA", { dateStyle:"medium", timeStyle:"short" })}</small></span>
    <b>R{item.net_amount_zar.toLocaleString("en-ZA")}<small className="capitalize">{item.status.replaceAll("_", " ")}</small></b>
    <details className="earnings-details earnings-breakdown"><summary>Details</summary><small>Gross R{item.gross_amount_zar.toLocaleString("en-ZA")} · Fee R{item.fee_amount_zar.toLocaleString("en-ZA")}</small></details>
  </div>)}
</details>

<details className="earnings-details earnings-section-details">
  <summary>Bank account &amp; payout settings</summary>
  <HandymanBankAccountForm />
  <p className="privacy-note">Weekly payouts are scheduled for Monday. Your bank details are stored securely.</p>
</details>
        </>}
        profile={<>
<div className="section-heading" id="my-profile"><div><div className="eyebrow">YOUR PROFILE</div><h2>Professional details</h2></div></div>
      <HandymanProfileForm profile={profile} />
        </>}
      />
    </div>
  </main>;
}
