"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CancelBookingButton({ jobId, hasTravelled }: { jobId: string; hasTravelled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function cancelBooking() {
    if (busy) return;
    const reason = window.prompt("Please tell us why you are cancelling this booking.");
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage("Please enter a cancellation reason.");
      return;
    }
    const warning = hasTravelled
      ? "The handyman has started travelling. A fixed R250 call-out compensation will be recorded for payment. Continue?"
      : "Cancel this booking? There is no travel compensation because the handyman has not marked themselves on the way.";
    if (!window.confirm(warning)) return;

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
      ? `Your booking has been cancelled. R${fee.toLocaleString("en-ZA")} travel compensation has been recorded; payment handling will follow.`
      : "Your booking has been cancelled.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-outline-dark" onClick={cancelBooking} disabled={busy}>
      {busy ? "Cancelling..." : "Cancel booking"}
    </button>
    {message && <p className={message.startsWith("Your booking") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
