"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MarkOnTheWayButton({ jobId, alreadyOnWay }: { jobId: string; alreadyOnWay: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(alreadyOnWay ? "You have marked yourself as on the way." : "");
  const router = useRouter();

  async function markOnTheWay() {
    if (busy || alreadyOnWay) return;
    if (!window.confirm("Confirm that you are now travelling to the customer's address? If the customer cancels after this, R250 travel compensation will be recorded.")) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("handyman_mark_booking_en_route", { p_job_id: jobId });
    setBusy(false);
    if (error) {
      setMessage(error.message || "We couldn't update your travel status.");
      return;
    }
    setMessage("Your travel status is recorded. If the customer cancels now, R250 compensation will be recorded.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-orange" onClick={markOnTheWay} disabled={busy || alreadyOnWay}>
      {busy ? "Saving..." : alreadyOnWay ? "On the way recorded" : "I'm on the way"}
    </button>
    {message && <p className={message.includes("recorded") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
