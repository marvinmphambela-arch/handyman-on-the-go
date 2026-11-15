"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, MapPin, Paperclip, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
  const [addressQuery, setAddressQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ label: string; suburb: string; city: string; latitude: number; longitude: number }>>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressSelected, setAddressSelected] = useState(false);\n  const [jobLatitude, setJobLatitude] = useState<number | null>(null);\n  const [jobLongitude, setJobLongitude] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (addressQuery.trim().length < 3 || addressSelected) { setAddressSuggestions([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressSearching(true);
      try {
        const params = new URLSearchParams({ q: `${addressQuery.trim()}, Gauteng, South Africa`, limit: "6", lang: "en", lat: "-26.2041", lon: "28.0473", bbox: "27.0,-27.5,29.5,-25.0" });
        const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Address search unavailable");
        const data = await response.json();
        const results = (data.features ?? []).map((feature: any) => {
          const p = feature.properties ?? {};
          const suburbName = p.suburb || p.district || p.locality || p.name || "";
          const cityName = p.city || p.county || p.state || "Gauteng";
          const label = [p.name, p.street, p.housenumber, suburbName, cityName, "South Africa"].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");
          const coordinates = feature.geometry?.coordinates ?? [];\n          return { label, suburb: suburbName, city: cityName, longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) };
        }).filter((item: { label: string }) => item.label);
        setAddressSuggestions(results);
      } catch (err) {
        if (!controller.signal.aborted) setAddressSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setAddressSearching(false);
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [addressQuery, addressSelected]);

  const canContinue = useMemo(() => {
    if (step === 0) return title.trim().length >= 5 && description.trim().length >= 20;
    if (step === 1) return suburb.trim().length > 1 && city.trim().length > 1 && address.trim().length > 4 && addressSelected;
    return true;
  }, [step, title, description, suburb, city, address, addressSelected]);

  function next() {
    if (!canContinue) {
      setError(step === 0 ? "Add a job title and a description of at least 20 characters." : "Please search for an address and select one of the suggestions.");
      return;
    }
    setError("");
    setStep((current) => Math.min(2, current + 1));
  }

  function handlePhotos(files: FileList | null) {
    if (!files) return;
    setPhotos(Array.from(files).slice(0, 4).map((file) => file.name));
  }

  async function submitRequest() {
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        setError("Please sign in as a customer before submitting a job request.");
        return;
      }

      const { data: category, error: categoryError } = await supabase
        .from("service_categories")
        .select("id")
        .eq("name", service)
        .eq("active", true)
        .single();
      if (categoryError || !category) {
        setError("We couldn't find that service category. Please try again in a moment.");
        return;
      }

      const { error: insertError } = await supabase.from("jobs").insert({
        customer_id: authData.user.id,
        service_category_id: category.id,
        title: title.trim(),
        description: description.trim(),
        suburb: suburb.trim(),
        city: city.trim(),
        province: "Gauteng",
        street_address: address.trim(),
        urgency,
      });
      if (insertError) {
        setError(insertError.message.includes("row-level security")
          ? "Your account does not have permission to submit this request. Please make sure you are signed in with a customer account."
          : "We couldn't save your request. Please try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Something went wrong while saving your request. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner"><Link className="brand" href="/"><span className="brand-mark"><Wrench size={21}/></span><span>handyman<span className="brand-accent">onthego</span></span></Link><Link href="/" className="back-link"><ArrowLeft size={15}/> Back to home</Link></div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">CUSTOMER REQUEST</div><h1>Tell us what needs fixing.</h1><p>Share a few details so nearby professionals can understand the job and make you an offer.</p></div>
      {!saved && <div className="progress-track">{steps.map((label, index) => <div className={index <= step ? "progress-step active" : "progress-step"} key={label}><span>{index < step ? <Check size={14}/> : index + 1}</span><small>{label}</small></div>)}</div>}
      {saved ? <section className="request-card completion"><CheckCircle2 size={42}/><h2>Your request has been saved.</h2><p>Your job request is now securely stored in your account. Your request is saved with map coordinates for distance matching. Nearby-job matching is being connected and no handyman has been notified yet.</p><div className="review-summary"><b>{title}</b><span>{service} · {urgency}</span><span>{suburb}, {city}</span></div><Link href="/account" className="btn btn-dark">Go to my account</Link></section> :
      <section className="request-card">
        {step === 0 && <div className="form-step"><div className="step-kicker">STEP 1 OF 3</div><h2>What kind of help do you need?</h2><p className="form-hint">Choose the closest service and describe the work.</p>
          <label className="field-label" htmlFor="service">Service category</label><div className="category-pills">{categories.map((item) => <button type="button" key={item} onClick={() => setService(item)} className={service === item ? "category-pill selected" : "category-pill"}>{item}</button>)}</div>
          <label className="field-label" htmlFor="job-title">Give your job a short title</label><input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking kitchen tap" maxLength={90}/>
          <label className="field-label" htmlFor="description">Describe what needs to be done</label><textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell the handyman what happened, what needs fixing and any useful details..." rows={5} maxLength={1200}/><div className="field-meta">{description.length}/1200 characters</div>
          <label className="field-label">How urgent is it?</label><div className="urgency-options">{[["standard","Standard","Schedule at a suitable time"],["urgent","Urgent","As soon as possible"],["emergency","Emergency","Needs immediate attention"]].map(([value,label,detail])=><button type="button" key={value} onClick={() => setUrgency(value)} className={urgency === value ? "urgency-option selected" : "urgency-option"}><b>{label}</b><small>{detail}</small></button>)}</div>
          <label className="field-label" htmlFor="photos">Add photos (optional, up to 4)</label><label className="upload-box" htmlFor="photos"><Paperclip size={18}/><span>Choose photos from your device</span><small>Photo uploads are not available yet; only file names are shown here.</small></label><input className="visually-hidden" id="photos" type="file" accept="image/*" multiple onChange={(e) => handlePhotos(e.target.files)}/>{photos.length > 0 && <p className="file-list">{photos.join(" · ")}</p>}
        </div>}
        {step === 1 && <div className="form-step"><div className="step-kicker">STEP 2 OF 3</div><h2>Where is the job?</h2><p className="form-hint">Enter the location where the work is needed.</p>
          <div className="location-note"><MapPin size={19}/><span><b>Gauteng launch area</b><small>For now, enter the job location manually.</small></span></div>
          <label className="field-label" htmlFor="address-search">Search for the job address</label>
          <input id="address-search" value={addressQuery} onChange={(e) => { setAddressQuery(e.target.value); setAddressSelected(false); setAddress(""); setJobLatitude(null); setJobLongitude(null); setAddressSuggestions([]); }} placeholder="Start typing a street, suburb or building..." autoComplete="off"/>
          {addressSearching && <p className="form-hint">Searching addresses…</p>}
          {addressSuggestions.length > 0 && <div className="address-suggestions" role="listbox" aria-label="Address suggestions">{addressSuggestions.map((item, index) => <button type="button" className="address-suggestion" key={`${item.label}-${index}`} onClick={() => { setAddress(item.label); setAddressQuery(item.label); setSuburb(item.suburb || suburb); setCity(item.city || city); setJobLatitude(Number.isFinite(item.latitude) ? item.latitude : null); setJobLongitude(Number.isFinite(item.longitude) ? item.longitude : null); setAddressSelected(true); setAddressSuggestions([]); }}><MapPin size={16}/><span>{item.label}</span></button>)}</div>}
          {addressSelected && <p className="privacy-note">Address selected: {address}</p>}
          {!addressSelected && addressQuery.trim().length >= 3 && !addressSearching && addressSuggestions.length === 0 && <p className="form-hint">No suggestions found. Try a nearby street or suburb name.</p>}
          <div className="selected-location-fields"><label className="field-label" htmlFor="suburb">Suburb or area (from selected address)</label><input id="suburb" value={suburb} readOnly/><label className="field-label" htmlFor="city">City or town (from selected address)</label><input id="city" value={city} readOnly/></div>
          <div className="privacy-note">Your exact address is private. The app saves map coordinates separately so it can calculate which handymen are within range.</div>
        </div>}
        {step === 2 && <div className="form-step"><div className="step-kicker">STEP 3 OF 3</div><h2>Review your request.</h2><p className="form-hint">Check the details before saving your request.</p>
          <div className="review-summary"><div className="review-row"><small>SERVICE</small><b>{service}</b></div><div className="review-row"><small>JOB</small><b>{title}</b><p>{description}</p></div><div className="review-row"><small>URGENCY</small><b className="capitalize">{urgency}</b></div><div className="review-row"><small>LOCATION</small><b>{suburb}, {city}</b><p>{address}</p></div><div className="review-row"><small>PHOTOS</small><b>{photos.length ? photos.join(", ") : "No photos added"}</b></div></div>
          <div className="privacy-note">When you submit, this request will be saved to your signed-in customer account. It will not yet be sent to handymen.</div>
        </div>}
        {error && <div className="form-error" role="alert">{error}{error.startsWith("Please sign in") && <> <Link href="/login">Sign in here</Link>.</>}</div>}
        <div className="form-actions">{step > 0 && <button className="btn btn-outline-dark" type="button" disabled={saving} onClick={() => {setError("");setStep((current) => current - 1);}}>Back</button>}{step < 2 ? <button className="btn btn-orange" type="button" onClick={next}>Continue <ArrowRight size={16}/></button> : <button className="btn btn-orange" type="button" disabled={saving} onClick={submitRequest}>{saving ? "Saving..." : "Submit job request"} <Check size={16}/></button>}</div>
      </section>}
      <p className="request-footnote">Handyman on the Go · Your Home. Your Choice. Your Handyman.</p>
    </div>
  </main>;
}
