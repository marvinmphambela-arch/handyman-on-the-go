"use client";

type Props = {
  verificationStatus: string;
  available: boolean;
  opportunitiesCount: number;
};

export default function JobRadarSearch({ verificationStatus, available, opportunitiesCount }: Props) {
  const approved = verificationStatus === "approved";
  const hasOpportunities = opportunitiesCount > 0;
  const searching = approved && available && !hasOpportunities;

  if (!approved) {
    const heading = verificationStatus === "under_review" ? "Your documents are under review"
      : verificationStatus === "rejected" ? "Your application was not approved"
      : verificationStatus === "suspended" ? "Your account is suspended"
      : "Verification is pending";
    const message = verificationStatus === "under_review" ? "Our team is reviewing your verification. You cannot receive job requests or submit offers until approval."
      : verificationStatus === "rejected" ? "You cannot receive job requests or submit offers. Please contact support."
      : verificationStatus === "suspended" ? "Your access to job requests and offers is currently paused. Please contact support."
      : "Your account is waiting for verification. You cannot receive job requests or submit offers until an administrator approves your account.";
    return <section className="request-card" aria-live="polite"><div className="eyebrow">VERIFICATION STATUS</div><h2>{heading}</h2><p>{message}</p></section>;
  }

  if (!available) {
    return <section className="request-card" aria-live="polite"><div className="eyebrow">YOUR AVAILABILITY</div><h2>Your profile is active</h2><p>You’re currently marked unavailable, so we’re not searching for new opportunities. Switch on your availability in your profile when you’re ready.</p></section>;
  }

  return <section className={`job-radar-card ${hasOpportunities ? "has-opportunities" : "is-searching"}`} aria-live="polite">
    <div className="job-radar-copy">
      <div className="eyebrow">{hasOpportunities ? "OPPORTUNITY FOUND" : "YOUR PROFILE IS ACTIVE"}</div>
      <h2>{hasOpportunities ? `You have ${opportunitiesCount} open ${opportunitiesCount === 1 ? "opportunity" : "opportunities"}` : "Looking for your next opportunity…"}</h2>
      <p>{hasOpportunities ? "The search is paused while you review the available work below." : "We’re keeping an eye out for new work. You’ll see an opportunity here as soon as one becomes available."}</p>
      {hasOpportunities && <a className="btn btn-orange job-radar-action" href="#new-jobs">View available work</a>}
    </div>
    <div className="job-radar-visual" aria-hidden="true">
      <div className="radar-display">
        <div className="radar-ring radar-ring-outer"></div>
        <div className="radar-ring radar-ring-middle"></div>
        <div className="radar-sweep"></div>
        <span className="radar-dot radar-dot-one"></span>
        <span className="radar-dot radar-dot-two"></span>
        <span className="radar-dot radar-dot-three"></span>
        <div className="radar-center"><span>HGO</span></div>
      </div>
    </div>
  </section>;
}
