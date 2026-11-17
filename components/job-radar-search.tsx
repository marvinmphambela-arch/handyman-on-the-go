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
        <svg viewBox="0 0 120 190" role="img" aria-label="A professional handyman standing beside the radar">
          <path className="adult-leg" d="M48 116 L45 158 L34 177" />
          <path className="adult-leg" d="M67 116 L76 157 L91 176" />
          <path className="adult-boot" d="M34 174 L61 174 L67 182 Q68 188 60 188 L34 188 Q27 187 30 181 Z" />
          <path className="adult-boot" d="M83 172 L103 172 L114 179 Q116 185 107 186 L87 187 Q80 186 81 180 Z" />
          <path className="adult-torso" d="M37 62 Q57 52 79 63 L88 119 Q62 130 35 119 Z" />
          <path className="adult-arm" d="M39 69 L28 99 L25 119" />
          <path className="adult-hand" d="M25 117 Q19 123 24 129 Q30 131 33 123" />
          <path className="adult-arm" d="M78 69 L91 96 L94 116" />
          <path className="adult-hand" d="M94 114 Q100 120 96 126 Q90 129 87 120" />
          <path className="adult-neck" d="M51 54 L52 65 L69 65 L70 54" />
          <path className="adult-face" d="M38 35 Q38 15 60 14 Q82 15 82 36 L79 51 Q74 65 60 66 Q45 64 40 51 Z" />
          <path className="adult-cap" d="M34 31 Q36 7 60 8 Q83 9 86 31 L72 27 Q53 22 34 31 Z" />
          <path className="adult-cap-brim" d="M33 30 Q57 24 88 33" />
          <path className="adult-smile" d="M52 48 Q60 54 68 48" />
          <path className="adult-pocket" d="M67 78 L80 78 L80 93 L67 93 Z" />
        </svg>
      </div>
    </div>
  </section>;
}
