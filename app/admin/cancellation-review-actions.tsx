"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CancellationReviewActions({ requestId }: { requestId: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function resolve(approve: boolean) {
    if (busy) return;
    const prompt = approve
      ? "Approve this customer cancellation request? The booking will be cancelled without a travel compensation fee."
      : "Decline this request and keep the booking active?";
    if (!window.confirm(prompt)) return;
    setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_resolve_cancellation_request", {
      p_request_id: requestId, p_approve: approve, p_admin_note: note.trim() || null
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage(approve ? "Request approved; booking cancelled." : "Request declined.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <label className="form-label" htmlFor={`admin-note-${requestId}`}>Admin note (optional)</label>
    <textarea id={`admin-note-${requestId}`} className="form-input" rows={2} maxLength={1000}
      value={note} onChange={e => setNote(e.target.value)} disabled={busy} placeholder="Record the review outcome..." />
    <div className="button-row">
      <button type="button" className="btn btn-orange" onClick={() => resolve(true)} disabled={busy}>{busy ? "Saving..." : "Approve cancellation"}</button>
      <button type="button" className="btn btn-outline-dark" onClick={() => resolve(false)} disabled={busy}>Decline request</button>
    </div>
    {message && <p className={message.includes("approved") || message.includes("declined") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
