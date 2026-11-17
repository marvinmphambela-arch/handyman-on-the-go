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
      .select("id, title, description, suburb, city, urgency, created_at, service_categories(name)")
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

      <section className="request-card" aria-live="polite">
        <div className="eyebrow">VERIFICATION STATUS</div>
        <h2>{profile.verification_status === "approved" ? "Your account is approved" : profile.verification_status === "under_review" ? "Your documents are under review" : profile.verification_status === "rejected" ? "Your application was not approved" : profile.verification_status === "suspended" ? "Your account is suspended" : "Verification is pending"}</h2>
        <p>{profile.verification_status === "approved" ? "You are approved to receive matching job requests and submit offers." : profile.verification_status === "under_review" ? "Our team is reviewing your verification. You cannot receive job requests or submit offers until approval." : profile.verification_status === "rejected" ? "You cannot receive job requests or submit offers. Please contact support." : profile.verification_status === "suspended" ? "Your access to job requests and offers is currently paused. Please contact support." : "Your account is waiting for verification. You cannot receive job requests or submit offers until an administrator approves your account."}</p>
      </section>
        </>}
        jobs={<>
<div className="section-heading" id="new-jobs"><div><div className="eyebrow">AVAILABLE WORK</div><h2>New opportunities ({opportunities.length})</h2></div></div>
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
<div className="section-heading"><div><div className="eyebrow">YOUR MONEY</div><h2>Earnings &amp; Access Wallet</h2></div></div>
<section className="request-card">
  <div className="eyebrow">THIS WEEK · MONDAY TO SUNDAY</div>
  <h2>R{Number(earningsSummary.week_total_zar ?? 0).toLocaleString("en-ZA")}</h2>
  <p>Net earnings recorded from jobs completed this week, including platform payments and Direct Payments.</p>
  <div className="review-summary">
    <div className="review-row"><small>PLATFORM PAYMENT</small><b>R{Number(earningsSummary.week_platform_zar ?? 0).toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>DIRECT PAYMENT</small><b>R{Number(earningsSummary.week_direct_zar ?? 0).toLocaleString("en-ZA")}</b></div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:"9px",alignItems:"end",height:"150px",marginTop:"24px"}}>
    {weeklyDaily.map((day, index) => <div key={day.day} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"end",height:"100%",gap:"7px"}}>
      <small style={{fontSize:"9px",color:"#667579"}}>R{Math.round(Number(day.total_zar || 0)).toLocaleString("en-ZA")}</small>
      <div title={`R${Number(day.total_zar || 0).toLocaleString("en-ZA")}`} style={{width:"100%",maxWidth:"34px",height:`${Math.max(5,Number(day.total_zar || 0)/weeklyMax*92)}px`,background:"#f58220",borderRadius:"7px 7px 2px 2px"}} />
      <small style={{fontSize:"10px",fontWeight:700,color:"#41535e"}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][index]}</small>
    </div>)}
  </div>
  <p className="privacy-note">The chart shows the current Johannesburg Monday–Sunday cycle. Direct Payments are included in this overview but excluded from platform payouts.</p>
</section>
<div className="job-list">
  <section className="request-card">
    <div className="eyebrow">PREPAID ACCESS WALLET</div>
    <h2>R{accessWalletBalance.toLocaleString("en-ZA")}</h2>
    <p>Used first toward the platform commission after a job is completed. Minimum top-up R100. Keep at least R10 in this wallet to submit offers.</p>
    <p className="privacy-note">Top-ups are processed securely through Paystack. Your wallet is credited only after the payment is verified.</p>
    <AccessWalletTopup />
  </section>
  <section className="request-card">
    <div className="eyebrow">OUTSTANDING COMMISSION</div>
    <h2>R{outstandingCommission.toLocaleString("en-ZA")}</h2>
    <p>Any Direct Payment commission shortfall is recovered from your next verified wallet top-up or your next platform-held job earnings, whichever happens first. It is never collected twice.</p>
  </section>
  <section className="request-card">
    <div className="eyebrow">PLATFORM-HELD EARNINGS</div>
    <h2>R{platformHeldEarnings.toLocaleString("en-ZA")}</h2>
    <p>Net earnings recorded for jobs paid through the platform and held or available for payout.</p>
  </section>
  <section className="request-card">
    <div className="eyebrow">PAID EARNINGS</div>
    <h2>R{paidEarnings.toLocaleString("en-ZA")}</h2>
    <p>Platform-held earnings recorded as paid to you.</p>
  </section>
  <section className="request-card">
    <div className="eyebrow">DIRECT PAYMENT EARNINGS</div>
    <h2>R{directEftEarnings.toLocaleString("en-ZA")}</h2>
    <p>Recorded separately. These payments are made directly to you by customers and are not part of platform-held payouts.</p>
  </section>
</div>
<div className="section-heading"><div><div className="eyebrow">ACCESS WALLET ACTIVITY</div><h2>Recent transactions</h2></div></div>
{walletTransactions.length === 0 ? <section className="request-card"><p className="privacy-note">No Access Wallet transactions yet.</p></section> : <div className="job-list">{walletTransactions.map(item => <article className="request-card" key={item.id}>
  <div className="eyebrow">{new Date(item.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
  <h3>{item.description || item.transaction_type.replaceAll("_", " ")}</h3>
  <p>{item.direction === "credit" ? "+" : "−"}R{item.amount_zar.toLocaleString("en-ZA")} · <span className="capitalize">{item.status}</span></p>
</article>)}</div>}
<div className="section-heading"><div><div className="eyebrow">JOB EARNINGS</div><h2>Recent completed jobs</h2></div></div>
{earnings.length === 0 ? <section className="request-card"><p className="privacy-note">Your completed-job earnings will appear here once payment and completion records are connected.</p></section> : <div className="job-list">{earnings.map(item => <article className="request-card" key={item.id}>
  <h3>Labour: R{item.labour_amount_zar.toLocaleString("en-ZA")}</h3>
  <div className="review-summary">
    <div className="review-row"><small>TOTAL COMMISSION (10%)</small><b>R{item.commission_total_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>PAID FROM ACCESS WALLET</small><b>R{item.commission_wallet_amount_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>SHORTFALL FROM THIS JOB'S EARNINGS</small><b>R{item.commission_amount_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>OLD DIRECT PAYMENT SHORTFALL RECOVERED</small><b>R{item.commission_carryforward_deducted_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>DIRECT PAYMENT SHORTFALL CARRIED FORWARD</small><b>R{item.commission_shortfall_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>NET HANDYMAN EARNINGS</small><b>R{item.net_earnings_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>PAYMENT METHOD</small><b>{item.payment_method === "direct_eft" ? "Direct payment" : "Platform payment"}</b></div>
    <div className="review-row"><small>STATUS</small><b className="capitalize">{item.status.replaceAll("_", " ")}</b></div>
  </div>
</article>)}</div>}
<div className="section-heading"><div><div className="eyebrow">PAYOUT HISTORY</div><h2>Withdrawals and payouts</h2></div></div>
{payouts.length === 0 ? <section className="request-card"><p className="privacy-note">No payout requests yet. Weekly payouts are planned for Monday. Instant withdrawals carry a 2% fee, with a R5 minimum fee and no minimum withdrawal amount.</p></section> : <div className="job-list">{payouts.map(item => <article className="request-card" key={item.id}>
  <h3>{item.payout_type === "instant" ? "Instant withdrawal" : "Weekly payout"}</h3>
  <p>Requested {new Date(item.requested_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>
  <div className="review-summary">
    <div className="review-row"><small>GROSS</small><b>R{item.gross_amount_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>FEE</small><b>R{item.fee_amount_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>NET PAYOUT</small><b>R{item.net_amount_zar.toLocaleString("en-ZA")}</b></div>
    <div className="review-row"><small>STATUS</small><b className="capitalize">{item.status}</b></div>
  </div>
</article>)}</div>}
<section className="request-card">
  <div className="eyebrow">PAYOUT SETTINGS</div>
  <h3>Weekly payout: Monday</h3>
  <p>Instant withdrawal fee: 2% of the amount, with a minimum fee of R5. There is no minimum withdrawal amount.</p>
  <p className="privacy-note">Top-ups are being tested in Paystack test mode. Commission deductions and withdrawals are not enabled yet.</p>
</section>
        </>}
        profile={<>
<div className="section-heading" id="my-profile"><div><div className="eyebrow">YOUR PROFILE</div><h2>Professional details</h2></div></div>
      <HandymanProfileForm profile={profile} />
        </>}
      />
    </div>
  </main>;
}
