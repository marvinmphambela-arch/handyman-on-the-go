"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MarkEnRouteButton({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function markEnRoute() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("handyman_mark_booking_en_route", { p_job_id: jobId });
    setBusy(false);
    if (error) {
      setMessage(error.message || "We couldn't update this booking.");
      return;
    }
    setMessage("You are marked as on the way. The customer can now see your travel status.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-orange" onClick={markEnRoute} disabled={busy}>
      {busy ? "Updating..." : "I'm on the way"}
    </button>
    {message && <p className={message.startsWith("You are marked") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
