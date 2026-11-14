import { ArrowRight, BadgeCheck, Bolt, Brush, Hammer, House, MapPin, Paintbrush, Star, Wrench } from "lucide-react";

const services = [
  { name: "Plumbing", detail: "Leaks, taps, toilets & geysers", icon: Wrench },
  { name: "Electrical", detail: "Faults, fittings & installations", icon: Bolt },
  { name: "Painting", detail: "Interior, exterior & touch-ups", icon: Paintbrush },
  { name: "Carpentry", detail: "Doors, cupboards & repairs", icon: Hammer },
  { name: "Home repairs", detail: "Everyday fixes around your home", icon: House },
  { name: "Cleaning", detail: "A fresh start for your space", icon: Brush }
];

export default function Home() {
  return <main>
    <header className="nav-wrap"><nav className="container nav">
      <a className="brand" href="#"><span className="brand-mark"><Wrench size={21}/></span><span>handyman<span className="brand-accent">onthego</span></span></a>
      <div className="nav-links"><a href="#services">Services</a><a href="#how">How it works</a><a href="#fairprice">FairPrice</a></div>
      <a className="btn btn-dark" href="/request">Get started <ArrowRight size={16}/></a>
    </nav></header>
    <section className="hero"><div className="container hero-grid">
      <div><div className="eyebrow">YOUR LOCAL HOME-SERVICE MARKETPLACE</div>
        <h1>Your home.<br/><em>Your choice.</em><br/>Your handyman.</h1>
        <p className="hero-text">Find the right professional for the job — at a price you both agree on. Home repairs made simpler, fairer and more human.</p>
        <div className="hero-buttons"><a className="btn btn-orange" href="/request">Find a handyman <ArrowRight size={17}/></a><a className="btn btn-outline" href="#handymen">I’m a handyman</a></div>
        <div className="trust-row"><BadgeCheck/><span><b>Built around your choice</b><small>Compare offers. Choose with confidence.</small></span></div>
      </div>
      <div className="hero-visual"><div className="visual-card"><Wrench size={58}/><strong>Repairs made easier.</strong><span>Local pros. Clear offers.</span></div><div className="floating-card"><Star/> Compare professionals<br/><small>Ratings, experience & arrival</small></div></div>
    </div><div className="container hero-foot"><span><MapPin size={15}/> Launching in Gauteng, South Africa</span><span>More choice. More control. Better home care.</span></div></section>
    <section className="section" id="services"><div className="container"><div className="eyebrow">WHAT CAN WE HELP WITH?</div><h2>Help for the jobs that make a house a home.</h2><div className="service-grid">{services.map(({name,detail,icon:Icon})=><a className="service-card" href="/request" key={name}><span className="service-icon"><Icon size={22}/></span><b>{name}</b><small>{detail}</small></a>)}</div></div></section>
    <section className="fair section" id="fairprice"><div className="container fair-grid"><div><div className="eyebrow">A SMARTER WAY TO START</div><h2>Know your numbers.<br/><em>Make your offer.</em></h2><p>FairPrice will help customers understand a reasonable starting range based on job type, complexity, labour, materials, travel and urgency. Estimates will use verified, administrator-managed rates.</p></div><div className="fair-panel"><span className="coming">COMING SOON</span><h3>FairPrice guidance</h3><strong>Configured price guidance</strong><p>No invented market prices. Catalogue values must be verified before estimates are shown.</p></div></div></section>
    <section className="section" id="how"><div className="container"><div className="eyebrow">SIMPLE BY DESIGN</div><h2>From “I need a hand” to “job well done”.</h2><div className="step-grid">{[["01","Describe the job","Tell us what needs fixing, add photos and share your location."],["02","Set your offer","Use FairPrice guidance, then propose the price that works for you."],["03","Compare & choose","Review professional offers, ratings and estimated arrival times."],["04","Get it sorted","Confirm your booking and follow progress through completion."]].map(([n,t,d])=><div key={n}><span>{n}</span><b>{t}</b><p>{d}</p></div>)}</div></div></section>
    <section className="bottom-cta" id="get-started"><div className="container cta-inner"><div><div className="eyebrow">YOUR HOME, YOUR CALL</div><h2>Let’s get that job off your list.</h2><p>Handyman on the Go is preparing to launch in Gauteng.</p></div><a className="btn btn-orange" href="/request">Register your interest <ArrowRight size={17}/></a></div></section>
    <footer><div className="container footer-inner"><b>Handyman on the Go</b><span>Your Home. Your Choice. Your Handyman.</span><small>Built for South Africa.</small></div></footer>
  </main>;
}