"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeclineOfferButton({ offerId }: { offerId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function declineOffer() {
    if (busy) return;
    const confirmed = window.confirm("Decline this handyman's offer? The job will remain open for other offers.");
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("decline_handyman_offer", { p_offer_id: offerId });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't decline this offer. Please try again.");
      return;
    }

    setMessage("Offer declined. The job remains open for other offers.");
    router.refresh();
  }

  return <div className="decline-offer-action">
    <button type="button" className="btn btn-secondary" onClick={declineOffer} disabled={busy}>
      {busy ? "Declining..." : "Decline offer"}
    </button>
    {message && <p className={message.startsWith("Offer declined") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
