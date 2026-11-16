"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RequestRow = { id: string; reason: string; concern_type: string; status: string; admin_note: string | null; created_at: string };

export default function InProgressReviewRequest({ jobId }: { jobId: string }) {
  const [reason, setReason] = useState("");
  const [concernType, setConcernType] = useState("safety_or_behaviour");
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.from("booking_cancellation_requests")
      .select("id, reason, concern_type, status, admin_note, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setRequest(data as RequestRow); });
  }, [jobId]);

  async function submit() {
    if (busy) return;
    if (!reason.trim()) { setMessage("Please explain what happened."); return; }
    setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("submit_in_progress_cancellation_request", {
      p_job_id: jobId, p_reason: reason.trim(), p_concern_type: concernType
    });
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    const { data } = await supabase.from("booking_cancellation_requests")
      .select("id, reason, concern_type, status, admin_note, created_at")
      .eq("job_id", jobId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) setRequest(data as RequestRow);
    setMessage("Your concern has been sent to the admin team for review.");
  }

  const showRequestForm = !request || request.status === "declined";

  return <div className="accept-offer-action">
    {request && <div className="review-summary">
      <p className="success-note">Your cancellation/review request is {request.status.replaceAll("_", " ")}.</p>
      <p>{request.reason}</p>
      {request.admin_note && <p className="privacy-note">Admin response: {request.admin_note}</p>}
      {request.status === "pending" && <p className="privacy-note">The booking is awaiting admin review. No R250 travel fee is automatically applied to this complaint.</p>}
    </div>}

    {showRequestForm && <>
      <h3>{request?.status === "declined" ? "Still need help with this booking?" : "Need help with this booking?"}</h3>
      <p className="privacy-note">If you have concerns about safety, behaviour, or the quality of work, request an admin review. You do not have to continue if you feel unsafe. This request does not automatically charge a cancellation fee.</p>
      <label className="form-label" htmlFor={`review-type-${jobId}`}>What is your concern?</label>
      <select id={`review-type-${jobId}`} className="form-input" value={concernType} onChange={e => setConcernType(e.target.value)} disabled={busy}>
        <option value="safety_or_behaviour">Safety or handyman behaviour</option>
        <option value="quality_or_competence">Quality of work or skills</option>
        <option value="other">Another concern</option>
      </select>
      <label className="form-label" htmlFor={`review-reason-${jobId}`}>Explain what happened</label>
      <textarea id={`review-reason-${jobId}`} className="form-input" rows={3} maxLength={1000}
        value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the problem..." disabled={busy} />
      <button type="button" className="btn btn-outline-dark" onClick={submit} disabled={busy}>{busy ? "Sending..." : request?.status === "declined" ? "Submit another review request" : "Request admin review"}</button>
    </>}
    {message && <p className={message.startsWith("Your concern") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
