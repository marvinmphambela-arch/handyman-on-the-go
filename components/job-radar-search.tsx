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
      {hasOpportunities && <a className="btn btn-orange job-radar-action" href="#new-jobs" onClick={() => document.querySelector<HTMLButtonElement>('.handyman-dashboard-nav button:nth-child(2)')?.click()}>View available work</a>}
    </div>
    <div className="job-radar-visual" aria-hidden="true">
      <div className="radar-ring radar-ring-outer"></div><div className="radar-ring radar-ring-middle"></div>
      <div className="radar-sweep"></div>
      <span className="radar-dot radar-dot-one"></span><span className="radar-dot radar-dot-two"></span><span className="radar-dot radar-dot-three"></span>
      <div className="radar-center"><span>HGO</span></div>
      <div className="radar-handyman">
        <svg viewBox="0 0 100 118" role="img" aria-label="Illustration of a handyman running">
          <path className="handyman-back-leg" d="M45 78 L35 94 L17 103" />
          <path className="handyman-front-leg" d="M55 77 L69 91 L84 88" />
          <path className="handyman-body" d="M39 42 Q50 35 62 43 L68 78 Q51 86 35 76 Z" />
          <path className="handyman-back-arm" d="M39 49 L23 61 L16 51" />
          <path className="handyman-front-arm" d="M62 49 L77 57 L84 45" />
          <circle className="handyman-head" cx="51" cy="27" r="15" />
          <path className="handyman-cap" d="M35 25 Q37 7 54 10 Q67 12 68 24 L58 23 Q47 18 35 25 Z" />
          <path className="handyman-cap-brim" d="M35 24 Q52 20 69 27" />
          <rect className="handyman-toolbox" x="69" y="57" width="19" height="15" rx="3" />
          <path className="handyman-toolbox-handle" d="M74 57 V53 Q78 49 83 53 V57" />
        </svg>
      </div>
    </div>
  </section>;
}
