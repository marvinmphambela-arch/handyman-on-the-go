"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Offer = {
  id: string;
  amount_zar: number;
  message: string | null;
  estimated_arrival_minutes: number | null;
  status: string;
};

export default function HandymanOfferForm({ jobId }: { jobId: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [arrival, setArrival] = useState("60");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadOffer() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) { setError("Please sign in again."); setLoading(false); } return; }
      const { data, error: loadError } = await supabase
        .from("job_offers")
        .select("id, amount_zar, message, estimated_arrival_minutes, status")
        .eq("job_id", jobId)
        .eq("handyman_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError("We couldn't load your offer. Please refresh the page.");
      else if (data) {
        setOffer(data as Offer);
        setAmount(String(data.amount_zar));
        setMessage(data.message ?? "");
        setArrival(String(data.estimated_arrival_minutes ?? 60));
      }
      setLoading(false);
    }
    loadOffer();
    return () => { active = false; };
  }, [jobId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    const price = Number(amount);
    const eta = Number(arrival);
    if (!Number.isSafeInteger(price) || price < 1) {
      setError("Enter a whole-number offer greater than R0."); setSaving(false); return;
    }
    if (!Number.isInteger(eta) || eta < 1 || eta > 10080) {
      setError("Enter an arrival estimate between 1 and 10,080 minutes."); setSaving(false); return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Please sign in again."); setSaving(false); return; }
    const values = {
      amount_zar: price,
      message: message.trim() || null,
      estimated_arrival_minutes: eta
    };
    const result = offer
      ? await supabase.from("job_offers").update(values).eq("id", offer.id).eq("status", "pending").select("id, amount_zar, message, estimated_arrival_minutes, status").single()
      : await supabase.from("job_offers").insert({ job_id: jobId, handyman_id: user.id, ...values, status: "pending" }).select("id, amount_zar, message, estimated_arrival_minutes, status").single();
    if (result.error || !result.data) {
      setError(result.error?.code === "23505"
        ? "You already have an offer on this job. Refresh the page to load it."
        : result.error
          ? `Offer save failed (${result.error.code ?? "unknown"}): ${result.error.message}${result.error.details ? " — " + result.error.details : ""}`
          : "The offer was not saved. Please refresh and try again.");
    } else {
      setOffer(result.data as Offer);
      setNotice(offer ? "Your pending offer has been updated." : "Your offer has been sent to the customer.");
    }
    setSaving(false);
  }

  if (loading) return <p className="form-hint">Checking your offer…</p>;
  if (offer && offer.status !== "pending") return <p className="privacy-note">Your offer is currently {offer.status}. It can no longer be edited here.</p>;

  return <form className="offer-form" onSubmit={submit}>
    <h3>{offer ? "Update your offer" : "Make an offer"}</h3>
    <label className="field-label" htmlFor={`offer-price-${jobId}`}>Your price (R)</label>
    <input id={`offer-price-${jobId}`} type="number" min="1" step="1" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 650" />
    <label className="field-label" htmlFor={`offer-message-${jobId}`}>Message to the customer (optional)</label>
    <textarea id={`offer-message-${jobId}`} rows={3} maxLength={500} value={message} onChange={e => setMessage(e.target.value)} placeholder="Briefly explain what your price includes." />
    <label className="field-label" htmlFor={`offer-arrival-${jobId}`}>Estimated arrival</label>
    <select id={`offer-arrival-${jobId}`} required value={arrival} onChange={e => setArrival(e.target.value)}>
      <option value="15">15 minutes</option>
      <option value="30">30 minutes</option>
      <option value="45">45 minutes</option>
      <option value="60">1 hour</option>
      <option value="90">1 hour 30 minutes</option>
      <option value="120">2 hours</option>
      <option value="180">3 hours</option>
      <option value="240">4 hours</option>
      <option value="480">Later today (within 8 hours)</option>
      <option value="1440">Tomorrow (within 24 hours)</option>
    </select>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="privacy-note" role="status">{notice}</p>}
    <button className="btn btn-orange" type="submit" disabled={saving}>{saving ? "Saving…" : offer ? "Update my offer" : "Send my offer"}</button>
  </form>;
}
