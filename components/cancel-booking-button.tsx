"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const cancellationReasons = [
  "I no longer need the service",
  "I am unhappy with the handyman's behaviour",
  "I am unhappy with the quality of work",
  "I do not feel safe or comfortable",
  "The handyman is late or has not arrived",
  "The price or scope has changed",
  "Other reason"
];

export default function CancelBookingButton({ jobId, enRoute, inProgress = false }: { jobId: string; enRoute: boolean; inProgress?: boolean }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function cancelBooking() {
    if (busy) return;
    if (!reason) {
      setMessage("Please choose a reason for cancelling.");
      return;
    }
    const recordedReason = details.trim() ? reason + " — " + details.trim() : reason;
    const confirmed = window.confirm(
      inProgress
        ? "Confirm cancellation now? Your booking will be cancelled immediately. No automatic travel fee will be applied; any compensation is handled separately."
        : enRoute
          ? "Confirm cancellation now? The handyman is already on the way, so the configured R250 travel compensation will be recorded separately."
          : "Confirm cancellation now? Your booking will be cancelled immediately."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cancel_customer_booking", {
      p_job_id: jobId,
      p_reason: recordedReason
    });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't cancel this booking. Please try again.");
      return;
    }

    const fee = Number(data ?? 0);
    setMessage(inProgress
      ? "Your booking has been cancelled. Any compensation will be reviewed separately."
      : fee > 0
        ? `Your booking has been cancelled. R${fee} travel compensation has been recorded for the handyman. Payment collection is not automated.`
        : "Your booking has been cancelled.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <h3>Cancel booking</h3>
    <p className="privacy-note">You can cancel if your plans change or you no longer wish to continue. Your cancellation takes effect as soon as you confirm.</p>
    <label className="form-label" htmlFor={`cancel-reason-${jobId}`}>Why are you cancelling?</label>
    <select id={`cancel-reason-${jobId}`} className="form-input" value={reason} onChange={event => setReason(event.target.value)} disabled={busy}>
      <option value="">Choose a reason</option>
      {cancellationReasons.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
    <label className="form-label" htmlFor={`cancel-details-${jobId}`}>Anything else? (optional)</label>
    <textarea id={`cancel-details-${jobId}`} className="form-input" rows={2} maxLength={800}
      value={details} onChange={event => setDetails(event.target.value)}
      placeholder="Add a short note if you wish." disabled={busy} />
    {inProgress
      ? <p className="privacy-note">Your booking will be cancelled immediately. No automatic travel fee applies after work has started; any compensation is reviewed separately.</p>
      : enRoute
        ? <p className="privacy-note">The handyman has marked themselves as on the way. The configured R250 travel compensation may be recorded; payment collection is not automated.</p>
        : <p className="privacy-note">No travel compensation applies unless the handyman has marked themselves as on the way.</p>}
    <button type="button" className="btn btn-outline-dark" onClick={cancelBooking} disabled={busy}>
      {busy ? "Cancelling..." : "Continue to confirmation"}
    </button>
    {message && <p className={message.startsWith("Your booking") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
