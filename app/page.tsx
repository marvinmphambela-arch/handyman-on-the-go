import { ArrowRight, BadgeCheck, Bolt, Brush, Check, ChevronRight, Clock3, Hammer, House, MapPin, Paintbrush, ShieldCheck, Sparkles, Star, Wrench } from "lucide-react";

const services = [
  { name: "Plumbing", detail: "Leaks, taps, toilets & geysers", icon: Wrench },
  { name: "Electrical", detail: "Faults, fittings & installations", icon: Bolt },
  { name: "Painting", detail: "Interior, exterior & touch-ups", icon: Paintbrush },
  { name: "Carpentry", detail: "Doors, cupboards & repairs", icon: Hammer },
  { name: "Home repairs", detail: "Everyday fixes around your home", icon: House },
  { name: "Cleaning", detail: "A fresher space, without the hassle", icon: Brush }
];

function BrandMark({ small = false }: { small?: boolean }) {
  return <span className={small ? "brand-mark brand-mark-small" : "brand-mark"} aria-hidden="true">
    <svg viewBox="0 0 64 64">
      <circle cx="35" cy="13" r="8" fill="#f3b17d"/><path d="M27 8q8-9 17 0l-1 5H26z" fill="#10283d"/>
      <path d="m28 23 12-3 9 12-9 8-12-5-8 10-7-5 10-14z" fill="#fff"/>
      <path d="m38 23 10 4 8 12-7 4-10-9" fill="#f28a32"/><path d="m27 33-8 14-10 3-2-6 9-7 5-11" fill="#f28a32"/>
      <path d="m32 37-9 13-11 5-3-5 9-9 5-10" fill="#10283d"/><path d="m41 38 8 8 9 2-1 6-13-1-10-9" fill="#10283d"/>
      <rect x="2" y="39" width="17" height="14" rx="3" fill="#f28a32" stroke="#10283d" strokeWidth="2"/>
      <path d="M6 39v-4h9v4M8 45h5" fill="none" stroke="#10283d" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </span>;
}

export default function Home() {
  return <main>
    <header className="nav-wrap"><nav className="container nav">
      <a className="brand" href="/" aria-label="Handyman on the Go home"><BrandMark/><span className="brand-name">Handyman <span className="brand-accent">on the Go</span><sup>™</sup></span></a>
      <div className="nav-links"><a href="#services">Services</a><a href="#how">How it works</a><a href="#fairprice">FairPrice</a></div>
      <a className="btn btn-nav" href="/request">Get started <ArrowRight size={16}/></a>
    </nav></header>

    <section className="hero"><div className="container hero-grid">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot"/> THE SMARTER WAY TO GET IT DONE</div>
        <h1>Your place.<br/><em>Your people.</em><br/>Your choice.</h1>
        <p className="hero-text">From the little fixes to the big to-dos, meet local service pros and choose the offer that works for you.</p>
        <div className="hero-buttons"><a className="btn btn-orange" href="/request">Find a handyman <ArrowRight size={18}/></a><a className="btn btn-outline" href="#handymen">I’m a handyman</a></div>
        <div className="hero-assurance"><span className="assurance-icon"><ShieldCheck size={19}/></span><span><b>Good work starts with a good choice.</b><small>Compare offers. Choose with confidence.</small></span></div>
      </div>
      <div className="hero-art tradesman-art" aria-label="Illustration of a South African tradesman moving quickly with his toolbox">
        <div className="art-speed speed-a"/><div className="art-speed speed-b"/><div className="art-speed speed-c"/>
        <svg className="tradesman-illustration" viewBox="0 0 560 470" role="img" aria-label="Tradesman in navy workwear carrying a toolbox">
          <ellipse cx="290" cy="426" rx="190" ry="18" fill="#061a2a" opacity=".22"/>
          <path d="M80 150 185 126M45 190l103-18M72 225l74-10" stroke="#f28a32" strokeWidth="8" strokeLinecap="round"/>
          <path d="M250 150q45-53 105-10l48 70-47 75-106-20-37-65z" fill="#f28a32"/>
          <path d="m253 161 91-30 61 76-38 74-95-25-35-65z" fill="#183e5b"/>
          <path d="m258 166-57 41-54-25-18 20 67 48 81-48" fill="#f0a16d"/>
          <path d="m154 183-37 5-24-19 8-13 35 11 32-1" fill="#f0a16d"/>
          <path d="m346 145 39-39 18 8-17 60-33 35" fill="#f0a16d"/><path d="m389 108 15-17 14 8-8 22-16 5" fill="#f0a16d"/>
          <path d="m267 265-70 79-78 22-10-24 61-43 43-90" fill="#10283d"/><path d="m196 344-10 35-48 23-25-7 10-24 55-27" fill="#f0a16d"/>
          <path d="m335 265 54 77 65 30-8 25-84-14-72-68" fill="#10283d"/><path d="m454 370 30 10 20 23-8 12-53-5-25-12" fill="#f0a16d"/>
          <path d="m110 392 53 4 10 16-15 12-77-4-4-10zM430 395l51 5 20 18-9 11-72-7-9-10z" fill="#d98b43"/>
          <path d="m263 155 32-18 42 10-7 58-56 17-27-32z" fill="#fff"/><path d="m280 155 27 5 19 43-37 17-30-32z" fill="#f28a32"/>
          <path d="M268 132q-2-39 34-47 33 1 39 35l-15 34-42-1z" fill="#8b563b"/>
          <path d="M264 112q7-42 47-40 29 3 34 28l-16 6-14-13-39 25z" fill="#10283d"/><path d="M273 91q29-29 64-4l-4 13q-29-12-56 7z" fill="#f28a32"/>
          <path d="M295 123q11 8 22 0" stroke="#10283d" strokeWidth="3" fill="none" strokeLinecap="round"/><path d="M287 111h3m20-1h3" stroke="#10283d" strokeWidth="4" strokeLinecap="round"/>
          <path d="m300 137 13 2" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
          <path d="m255 227 83 18-9 22-82-19z" fill="#e6a05e"/>
          <rect x="46" y="251" width="133" height="103" rx="14" fill="#f28a32" stroke="#10283d" strokeWidth="9"/>
          <path d="M79 250v-17q0-12 13-12h40q13 0 13 12v17" fill="none" stroke="#10283d" strokeWidth="9"/>
          <path d="M46 284h133M91 284v15h42v-15" fill="none" stroke="#10283d" strokeWidth="7"/><path d="m90 321 20-18 18 18-18 17z" fill="#10283d"/>
        </svg>
        <div className="art-sticker"><Sparkles size={16}/> READY WHEN YOU NEED A HAND</div>
        <div className="art-caption"><span className="caption-icon"><Check size={17}/></span><span><b>Local skills. Real people.</b><small>Good work, moving forward.</small></span></div>
      </div>
    </div>
    <div className="container hero-foot"><span><MapPin size={15}/> Launching in Gauteng, South Africa</span><span>For homes. For businesses. For the people who make them work.</span></div></section>

    <section className="value-strip"><div className="container value-grid"><div><BadgeCheck/><span><b>Your choice comes first</b><small>Compare before you decide</small></span></div><div><Clock3/><span><b>Less back-and-forth</b><small>One place to find help</small></span></div><div><Star/><span><b>Work that matters</b><small>More opportunities for local pros</small></span></div></div></section>

    <section className="section" id="services"><div className="container"><div className="section-heading"><div><div className="eyebrow">A HAND FOR EVERY TO-DO</div><h2>What needs doing<br/><em>around your place?</em></h2></div><a className="text-link" href="/request">Explore services <ArrowRight size={16}/></a></div><div className="service-grid">{services.map(({name,detail,icon:Icon})=><a className="service-card" href="/request" key={name}><span className="service-icon"><Icon size={22}/></span><b>{name}</b><small>{detail}</small><ChevronRight className="service-arrow" size={17}/></a>)}</div></div></section>

    <section className="fair section" id="fairprice"><div className="container fair-grid"><div><div className="eyebrow">A FAIRER STARTING POINT</div><h2>Know the range.<br/><em>Make your offer.</em></h2><p>FairPrice is being designed to help customers understand a reasonable starting range based on the job, complexity, labour, materials, travel and urgency. Guidance will use verified, administrator-managed rates.</p><a className="text-link" href="/request">See how requests work <ArrowRight size={16}/></a></div><div className="fair-panel"><div className="fair-panel-top"><span className="fair-symbol"><Sparkles size={20}/></span><span className="coming">IN DEVELOPMENT</span></div><h3>FairPrice guidance</h3><strong>A clearer way to start the conversation.</strong><p>No made-up market prices. Price guidance will only appear once the catalogue is configured and verified.</p><div className="fair-check"><Check size={15}/> Built around transparent inputs</div></div></div></section>

    <section className="section" id="how"><div className="container"><div className="eyebrow">SIMPLE FROM THE START</div><h2>From “I need a hand”<br/><em>to “job well done”.</em></h2><div className="step-grid">{[["01","Describe the job","Tell us what needs fixing, add photos and share your location."],["02","Set your offer","Use FairPrice guidance, then propose the price that works for you."],["03","Compare & choose","Review offers, ratings and estimated arrival times."],["04","Get it sorted","Confirm your booking and follow progress through completion."]].map(([n,t,d])=><div key={n}><span>{n}</span><b>{t}</b><p>{d}</p></div>)}</div></div></section>

    <section className="partner-cta" id="handymen"><div className="container partner-inner"><div><div className="eyebrow">GOOD HANDS. MORE OPPORTUNITY.</div><h2>Your skills deserve<br/>to be in demand.</h2><p>For independent handymen and service professionals ready to connect with customers and grow their work.</p></div><a className="btn btn-light" href="/request">Join the community <ArrowRight size={17}/></a></div></section>

    <section className="bottom-cta"><div className="container cta-inner"><div><div className="eyebrow">YOUR PLACE. YOUR PEOPLE. YOUR CHOICE.</div><h2>Let’s get that job<br/>off your list.</h2><p>Handyman on the Go is preparing to launch in Gauteng.</p></div><a className="btn btn-orange" href="/request">Get started <ArrowRight size={17}/></a></div></section>
    <footer><div className="container footer-inner"><a className="brand footer-brand" href="/"><BrandMark small/><span className="brand-name">Handyman <span className="brand-accent">on the Go</span><sup>™</sup></span></a><span>Your Home. Your Choice. Your Handyman.</span><small>Built for South Africa.</small></div></footer>
  </main>;
}
