"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  full_name: string | null;
  phone: string | null;
  services: string[] | null;
  service_areas: string[] | null;
  search_radius_km?: number | null;
  years_experience: number | null;
  bio: string | null;
  available: boolean | null;
};

const serviceOptions = ["Plumbing", "Electrical", "Painting", "Carpentry", "Home repairs", "Cleaning"];

export default function HandymanProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [services, setServices] = useState<string[]>(profile?.services ?? []);
  const [areas, setAreas] = useState((profile?.service_areas ?? []).join(", "));
  const [radius, setRadius] = useState(String(profile?.search_radius_km ?? 10));
  const [experience, setExperience] = useState(String(profile?.years_experience ?? 0));
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [available, setAvailable] = useState(profile?.available ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function toggleService(service: string) {
    setServices(current => current.includes(service) ? current.filter(item => item !== service) : [...current, service]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const years = Number(experience);
    if (!Number.isInteger(years) || years < 0 || years > 60) {
      setError("Please enter experience from 0 to 60 years."); setBusy(false); return;
    }
    if (services.length === 0) {
      setError("Please choose at least one service."); setBusy(false); return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Please sign in again."); setBusy(false); return; }
    const { error: saveError } = await supabase.from("profiles").update({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      services,
      service_areas: areas.split(",").map(area => area.trim()).filter(Boolean),
      search_radius_km: Number(radius),
      years_experience: years,
      bio: bio.trim() || null,
      available
    }).eq("id", user.id);
    if (saveError) setError(saveError.message);
    else { setMessage("Your handyman profile has been saved."); router.refresh(); }
    setBusy(false);
  }

  return <form className="request-card form-step" onSubmit={save}>
    <label className="field-label" htmlFor="handyman-name">Full name</label>
    <input id="handyman-name" required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} />
    <label className="field-label" htmlFor="handyman-phone">Phone number</label>
    <input id="handyman-phone" type="tel" placeholder="+27..." value={phone} onChange={e=>setPhone(e.target.value)} />
    <span className="field-label">Services you offer</span>
    <div className="choice-grid">{serviceOptions.map(service=><label key={service} className="choice-option"><input type="checkbox" checked={services.includes(service)} onChange={()=>toggleService(service)} /> {service}</label>)}</div>
    <label className="field-label" htmlFor="handyman-radius">How far are you willing to travel?</label>
    <select id="handyman-radius" value={radius} onChange={e=>setRadius(e.target.value)}>
      <option value="5">5 km</option><option value="10">10 km (recommended)</option><option value="20">20 km</option><option value="30">30 km</option>
    </select>
    <p className="form-hint">Nearby jobs will be matched within this distance of your current location when location matching is enabled.</p>
    <label className="field-label" htmlFor="handyman-experience">Years of experience</label>
    <input id="handyman-experience" type="number" min="0" max="60" value={experience} onChange={e=>setExperience(e.target.value)} />
    <label className="field-label" htmlFor="handyman-bio">About your work</label>
    <textarea id="handyman-bio" rows={4} maxLength={600} placeholder="Briefly describe your experience and the work you do." value={bio} onChange={e=>setBio(e.target.value)} />
    <label className="choice-option"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)} /> I am currently available for work</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="privacy-note" role="status">{message}</p>}
    <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Saving..." : "Save my profile"}</button>
  </form>;
}
