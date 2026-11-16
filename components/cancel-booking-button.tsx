"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CancelBookingButton({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function cancelBooking() {
    if (busy) return;
    const confirmed = window.confirm("Cancel this booking? You can only cancel before the handyman starts work.");
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_customer_booking", { p_job_id: jobId });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't cancel this booking. Please try again.");
      return;
    }

    setMessage("Your booking has been cancelled.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-outline-dark" onClick={cancelBooking} disabled={busy}>
      {busy ? "Cancelling..." : "Cancel booking"}
    </button>
    {message && <p className={message.startsWith("Your booking") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
