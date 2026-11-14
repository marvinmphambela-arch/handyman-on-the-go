"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, MapPin, Paperclip, Wrench } from "lucide-react";

const categories = ["Plumbing", "Electrical", "Painting", "Carpentry", "Home repairs", "Cleaning", "Other"];
const steps = ["The job", "Location", "Review"];

export default function NewRequestPage() {
  const [step, setStep] = useState(0);
  const [service, setService] = useState("Plumbing");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("standard");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("Johannesburg");
  const [address, setAddress] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewComplete, setPreviewComplete] = useState(false);
  const [error, setError] = useState("");

  const canContinue = useMemo(() => {
    if (step === 0) return title.trim().length >= 5 && description.trim().length >= 20;
    if (step === 1) return suburb.trim().length > 1 && city.trim().length > 1 && address.trim().length > 4;
    return true;
  }, [step, title, description, suburb, city, address]);

  function next() {
    if (!canContinue) {
      setError(step === 0 ? "Add a job title and a description of at least 20 characters." : "Please complete your suburb, city and street or area address.");
      return;
    }
    setError("");
    setStep((current) => Math.min(2, current + 1));
  }

  function handlePhotos(files: FileList | null) {
    if (!files) return;
    setPhotos(Array.from(files).slice(0, 4).map((file) => file.name));
  }

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner"><Link className="brand" href="/"><span className="brand-mark"><Wrench size={21}/></span><span>handyman<span className="brand-accent">onthego</span></span></Link><Link href="/" className="back-link"><ArrowLeft size={15}/> Back to home</Link></div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">CUSTOMER REQUEST</div><h1>Tell us what needs fixing.</h1><p>Share a few details so nearby professionals can understand the job and make you an offer.</p></div>
      <div className="progress-track">{steps.map((label, index) => <div className={index <= step ? "progress-step active" : "progress-step"} key={label}><span>{index < step ? <Check size={14}/> : index + 1}</span><small>{label}</small></div>)}</div>
      {previewComplete ? <section className="request-card completion"><CheckCircle2 size={42}/><h2>Your request preview is ready.</h2><p>We've completed the request details in this browser preview. It has <b>not</b> been sent to handymen or saved to an account yet. We'll connect secure sign-in, photo storage and request submission when the Supabase project is configured.</p><div className="review-summary"><b>{title}</b><span>{service} · {urgency}</span><span>{suburb}, {city}</span></div><Link href="/" className="btn btn-dark">Return to homepage</Link></section> :
      <section className="request-card">
        {step === 0 && <div className="form-step"><div className="step-kicker">STEP 1 OF 3</div><h2>What kind of help do you need?</h2><p className="form-hint">Choose the closest service and describe the work.</p>
          <label className="field-label" htmlFor="service">Service category</label><div className="category-pills">{categories.map((item) => <button type="button" key={item} onClick={() => setService(item)} className={service === item ? "category-pill selected" : "category-pill"}>{item}</button>)}</div>
          <label className="field-label" htmlFor="job-title">Give your job a short title</label><input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking kitchen tap" maxLength={90}/>
          <label className="field-label" htmlFor="description">Describe what needs to be done</label><textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell the handyman what happened, what needs fixing and any useful details..." rows={5} maxLength={1200}/><div className="field-meta">{description.length}/1200 characters</div>
          <label className="field-label">How urgent is it?</label><div className="urgency-options">{[["standard","Standard","Schedule at a suitable time"],["urgent","Urgent","As soon as possible"],["emergency","Emergency","Needs immediate attention"]].map(([value,label,detail])=><button type="button" key={value} onClick={() => setUrgency(value)} className={urgency === value ? "urgency-option selected" : "urgency-option"}><b>{label}</b><small>{detail}</small></button>)}</div>
          <label className="field-label" htmlFor="photos">Add photos (optional, up to 4)</label><label className="upload-box" htmlFor="photos"><Paperclip size={18}/><span>Choose photos from your device</span><small>JPG, PNG or HEIC · Upload will be enabled in the connected app</small></label><input className="visually-hidden" id="photos" type="file" accept="image/*" multiple onChange={(e) => handlePhotos(e.target.files)}/>{photos.length > 0 && <p className="file-list">{photos.join(" · ")}</p>}
        </div>}
        {step === 1 && <div className="form-step"><div className="step-kicker">STEP 2 OF 3</div><h2>Where is the job?</h2><p className="form-hint">Handymen need an approximate location to assess travel and availability. Your full address should only be shared with the professional you choose.</p>
          <div className="location-note"><MapPin size={19}/><span><b>Gauteng launch area</b><small>For now, enter the job location manually. Precise map pinning will be added later.</small></span></div>
          <label className="field-label" htmlFor="suburb">Suburb or area</label><input id="suburb" value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="e.g. Randburg"/>
          <label className="field-label" htmlFor="city">City or town</label><input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Johannesburg"/>
          <label className="field-label" htmlFor="address">Street address or useful location details</label><textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street name, complex name or nearby landmark" rows={3}/>
          <div className="privacy-note">Your exact address will not be shown publicly. We'll apply access controls before real requests can be submitted.</div>
        </div>}
        {step === 2 && <div className="form-step"><div className="step-kicker">STEP 3 OF 3</div><h2>Review your request.</h2><p className="form-hint">Check the details before the request flow is connected to live handymen.</p>
          <div className="review-summary"><div className="review-row"><small>SERVICE</small><b>{service}</b></div><div className="review-row"><small>JOB</small><b>{title}</b><p>{description}</p></div><div className="review-row"><small>URGENCY</small><b className="capitalize">{urgency}</b></div><div className="review-row"><small>LOCATION</small><b>{suburb}, {city}</b><p>{address}</p></div><div className="review-row"><small>PHOTOS</small><b>{photos.length ? photos.join(", ") : "No photos added"}</b></div></div>
          <div className="privacy-note">This is a front-end preview only. Your request will not be published, and no handyman will be notified until account authentication and the Supabase database are connected.</div>
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">{step > 0 && <button className="btn btn-outline-dark" type="button" onClick={() => {setError("");setStep((current) => current - 1);}}>Back</button>}{step < 2 ? <button className="btn btn-orange" type="button" onClick={next}>Continue <ArrowRight size={16}/></button> : <button className="btn btn-orange" type="button" onClick={() => setPreviewComplete(true)}>Complete preview <Check size={16}/></button>}</div>
      </section>}
      <p className="request-footnote">Handyman on the Go · Your Home. Your Choice. Your Handyman.</p>
    </div>
  </main>;
}
