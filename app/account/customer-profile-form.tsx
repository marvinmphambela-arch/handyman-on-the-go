"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CustomerProfileForm({
  fullName: initialName,
  phone: initialPhone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const name = fullName.trim();
    const phoneNumber = phone.trim();
    if (!name) {
      setError("Please enter your full name.");
      setBusy(false);
      return;
    }
    if (!phoneNumber) {
      setError("A phone number is required.");
      setBusy(false);
      return;
    }
    if (phoneNumber.length > 30) {
      setError("Please enter a valid phone number.");
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Your session has expired. Please sign in again.");
      setBusy(false);
      return;
    }

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ full_name: name, phone: phoneNumber })
      .eq("id", user.id);

    if (saveError) {
      setError("We couldn't save your details. Please try again.");
    } else {
      setMessage("Your personal information has been updated.");
      router.refresh();
    }
    setBusy(false);
  }

  return <section className="request-card form-step customer-profile-card">
    <div className="eyebrow">YOUR ACCOUNT</div>
    <h2>My Personal Information</h2>
    <p className="privacy-note">Keep your contact details up to date so we can assist with your bookings.</p>
    <form onSubmit={save}>
      <label className="field-label" htmlFor="customer-profile-name">Full name</label>
      <input id="customer-profile-name" type="text" autoComplete="name" required maxLength={100} value={fullName} onChange={event => setFullName(event.target.value)} />
      <label className="field-label" htmlFor="customer-profile-phone">Phone number</label>
      <input id="customer-profile-phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="+27..." value={phone} onChange={event => setPhone(event.target.value)} />
      <label className="field-label" htmlFor="customer-profile-email">Email address</label>
      <input id="customer-profile-email" type="email" value={email} readOnly aria-readonly="true" />
      <p className="form-hint">Your email address is used to sign in and cannot be changed here.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="success-note" role="status">{message}</p>}
      <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</button>
    </form>
  </section>;
}
