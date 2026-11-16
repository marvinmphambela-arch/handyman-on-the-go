"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FindReplacementHandyman({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function decide(findAnother: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("customer_decide_replacement_handyman", {
      p_job_id: jobId,
      p_find_another: findAnother
    });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't save your choice. Please try again.");
      return;
    }

    setMessage(findAnother
      ? "We'll look for another suitable handyman using your existing job request."
      : "No problem. Your cancelled job will remain in your history.");
    router.refresh();
  }

  return <section className="review-summary" aria-live="polite">
    <h3>Would you like us to find another handyman for this job?</h3>
    <p className="privacy-note">You won't need to submit another request. We'll use the same job details and location.</p>
    <div className="button-row">
      <button type="button" className="btn btn-orange" onClick={() => decide(true)} disabled={busy}>
        {busy ? "Saving..." : "Yes, find another handyman"}
      </button>
      <button type="button" className="btn btn-outline-dark" onClick={() => decide(false)} disabled={busy}>
        No, thank you
      </button>
    </div>
    {message && <p className={message.startsWith("We'll") || message.startsWith("No problem") ? "success-note" : "form-error"} role="status">{message}</p>}
  </section>;
}
