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

const serviceOptions = ["Plumbing", "Electrical", "Painting & Decorating", "Carpentry", "Building & Renovations", "Gardening & Outdoor", "Cleaning", "Appliance Repairs", "Roofing & Gutters", "Locks & Security", "Furniture Assembly", "General Home Repairs", "Other Home Services"];

const serviceAreaOptions = ["Johannesburg", "Sandton", "Randburg", "Roodepoort", "Soweto", "Midrand", "Fourways", "Alexandra", "Diepsloot", "Lenasia", "Orange Farm", "Alberton", "Germiston", "Kempton Park", "Edenvale", "Bedfordview", "Benoni", "Boksburg", "Brakpan", "Centurion", "Pretoria", "Krugersdorp", "Mogale City Local Municipality"];

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Location access is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      error => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission was not granted. Allow location access in your browser to become available for nearby jobs."));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error("Your location could not be found in time. Please try again."));
        } else {
          reject(new Error("We could not get your location. Please check your phone's location setting and try again."));
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  });
}

export default function HandymanProfileForm({ profile }: { profile: Profile | null }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [services, setServices] = useState<string[]>(profile?.services ?? []);
  const [areas, setAreas] = useState<string[]>(profile?.service_areas ?? []);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
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

  function toggleArea(area: string) {
    setAreas(current => current.includes(area) ? current.filter(item => item !== area) : [...current, area]);
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

    let latitude: number | null = null;
    let longitude: number | null = null;
    let locationUpdatedAt: string | null = null;

    if (available) {
      try {
        setMessage("Please allow location access when your browser asks. Your location is used for nearby job matching.");
        const position = await getCurrentPosition();
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
        locationUpdatedAt = new Date().toISOString();
      } catch (locationError) {
        setMessage("");
        setError(locationError instanceof Error ? locationError.message : "Location access is required when you are available for nearby jobs.");
        setBusy(false);
        return;
      }
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Please sign in again."); setMessage(""); setBusy(false); return; }
    const { error: saveError } = await supabase.from("profiles").update({
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      services,
      service_areas: areas,
      search_radius_km: Number(radius),
      years_experience: years,
      bio: bio.trim() || null,
      available,
      current_latitude: latitude,
      current_longitude: longitude,
      location_updated_at: locationUpdatedAt
    }).eq("id", user.id);
    if (saveError) { setError(saveError.message); setMessage(""); }
    else {
      setMessage(available ? "Your profile is saved and your location is ready for nearby job matching." : "Your handyman profile has been saved. You are marked unavailable and your saved location has been cleared.");
      router.refresh();
    }
    setBusy(false);
  }

  return <form className="request-card form-step" onSubmit={save}>
    <label className="field-label" htmlFor="handyman-name">Full name</label>
    <input id="handyman-name" required maxLength={100} value={fullName} onChange={e=>setFullName(e.target.value)} />
    <label className="field-label" htmlFor="handyman-phone">Phone number</label>
    <input id="handyman-phone" type="tel" placeholder="+27..." value={phone} onChange={e=>setPhone(e.target.value)} />
    <span className="field-label">Services you offer</span>
    <div className="choice-grid">{serviceOptions.map(service=><label key={service} className="choice-option"><input type="checkbox" checked={services.includes(service)} onChange={()=>toggleService(service)} /> {service}</label>)}</div>
    <span className="field-label">Areas where you can work</span>
    <button className="btn btn-secondary" type="button" onClick={() => setAreaPickerOpen(current => !current)} aria-expanded={areaPickerOpen}>
      {areaPickerOpen ? "Close area list" : "Choose service areas"}
    </button>
    {areas.length > 0 ? <p className="form-hint">Selected: {areas.join(", ")}</p> : <p className="form-hint">Choose at least one area so we can match you with nearby jobs.</p>}
    {areaPickerOpen && <div className="choice-grid" role="group" aria-label="Select service areas">
      {serviceAreaOptions.map(area => <label key={area} className="choice-option"><input type="checkbox" checked={areas.includes(area)} onChange={() => toggleArea(area)} /> {area}</label>)}
      <button className="btn btn-orange" type="button" onClick={() => setAreaPickerOpen(false)}>Done</button>
    </div>}
    <label className="field-label" htmlFor="handyman-radius">How far are you willing to travel?</label>
    <select className="choice-select" id="handyman-radius" value={radius} onChange={e=>setRadius(e.target.value)}>
      <option value="5">5 km</option><option value="10">10 km (recommended)</option><option value="20">20 km</option><option value="30">30 km</option>
    </select>
    <p className="form-hint">Nearby jobs will be matched within this distance of your current location when location matching is enabled.</p>
    <label className="field-label" htmlFor="handyman-experience">Years of experience</label>
    <input id="handyman-experience" type="number" min="0" max="60" value={experience} onChange={e=>setExperience(e.target.value)} />
    <label className="field-label" htmlFor="handyman-bio">About your work</label>
    <textarea id="handyman-bio" rows={4} maxLength={600} placeholder="Briefly describe your experience and the work you do." value={bio} onChange={e=>setBio(e.target.value)} />
    <label className="choice-option"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)} /> I am currently available for work</label>
    <p className="form-hint">When you save while available, your browser will ask permission to use your current location. Your exact location is kept private and is not shown to customers or other handymen.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="privacy-note" role="status">{message}</p>}
    <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Saving..." : "Save my profile"}</button>
  </form>;
}
