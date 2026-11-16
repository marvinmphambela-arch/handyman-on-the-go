"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function VerificationActions({ handymanId }: { handymanId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: "approved" | "rejected") {
    const prompt = decision === "approved"
      ? "Approve this handyman's verification?"
      : "Reject this verification submission?";
    if (!window.confirm(prompt)) return;
    setBusy(true); setError("");
    const supabase = createClient();
    const { error: reviewError } = await supabase.rpc("review_handyman_verification", {
      p_handyman_id: handymanId,
      p_decision: decision,
      p_admin_notes: notes
    });
    if (reviewError) setError(reviewError.message);
    else router.refresh();
    setBusy(false);
  }

  return <div className="job-list">
    <label className="field-label" htmlFor={"admin-notes-" + handymanId}>Review notes (optional)</label>
    <textarea id={"admin-notes-" + handymanId} rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal note for your records" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="button-row">
      <button className="btn btn-orange" type="button" disabled={busy} onClick={()=>decide("approved")}>{busy ? "Saving..." : "Approve handyman"}</button>
      <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={()=>decide("rejected")}>Reject submission</button>
    </div>
  </div>;
}
