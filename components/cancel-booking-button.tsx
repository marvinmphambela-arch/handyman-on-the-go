"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CancelBookingButton({ jobId, enRoute }: { jobId: string; enRoute: boolean }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function cancelBooking() {
    if (busy) return;
    if (!reason.trim()) {
      setMessage("Please enter a reason for cancelling.");
      return;
    }
    const confirmed = window.confirm(
      enRoute
        ? "The handyman is already on the way. A R250 travel call-out compensation will be recorded for the handyman if you cancel. Continue?"
        : "Cancel this booking? The handyman has not marked themselves as on the way."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cancel_customer_booking", {
      p_job_id: jobId,
      p_reason: reason.trim()
    });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't cancel this booking. Please try again.");
      return;
    }

    const fee = Number(data ?? 0);
    setMessage(fee > 0
      ? `Your booking has been cancelled. R${fee} travel compensation has been recorded for the handyman.`
      : "Your booking has been cancelled.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <label className="form-label" htmlFor={`cancel-reason-${jobId}`}>Reason for cancellation</label>
    <textarea id={`cancel-reason-${jobId}`} className="form-input" rows={3} maxLength={1000}
      value={reason} onChange={event => setReason(event.target.value)}
      placeholder="Please explain why you need to cancel." disabled={busy} />
    <p className="privacy-note">{enRoute
      ? "The handyman has marked themselves as on the way. A fixed R250 travel compensation will be recorded if you cancel."
      : "No travel compensation applies unless the handyman has marked themselves as on the way."}</p>
    <button type="button" className="btn btn-outline-dark" onClick={cancelBooking} disabled={busy}>
      {busy ? "Cancelling..." : "Cancel booking"}
    </button>
    {message && <p className={message.startsWith("Your booking") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
