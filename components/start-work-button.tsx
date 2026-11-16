"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StartWorkButton({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function startWork() {
    if (busy) return;
    const confirmed = window.confirm("Confirm that you have arrived and are starting work on this booking?");
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("handyman_start_booking_work", { p_job_id: jobId });
    setBusy(false);
    if (error) {
      setMessage(error.message || "We couldn't update this booking.");
      return;
    }
    setMessage("Work has been marked as in progress. The customer can see this update.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-orange" onClick={startWork} disabled={busy}>
      {busy ? "Updating..." : "Start work"}
    </button>
    {message && <p className={message.startsWith("Work has") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
