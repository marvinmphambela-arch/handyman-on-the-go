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
    <span className="brand-monogram">HGO</span>
    <span className="brand-underline"/>
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
      <div className="hero-art hgo-hero-mark" aria-label="HGO brand monogram">
        <div className="hgo-hero-card">
          <span className="hgo-hero-letters">HGO</span>
          <span className="hgo-hero-underline"/>
          <span className="hgo-hero-caption">HANDYMAN ON THE GO™</span>
        </div>
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
