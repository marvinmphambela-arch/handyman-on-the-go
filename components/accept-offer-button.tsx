"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptOfferButton({ offerId, disabled = false }: { offerId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function acceptOffer() {
    if (busy || disabled) return;
    const confirmed = window.confirm("Accept this handyman's offer? Other offers for this job will be declined.");
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("accept_handyman_offer", { p_offer_id: offerId });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't accept this offer. Please try again.");
      return;
    }

    setMessage("Offer accepted. Your booking is confirmed.");
    router.refresh();
  }

  return <div className="accept-offer-action">
    <button type="button" className="btn btn-orange" onClick={acceptOffer} disabled={busy || disabled}>
      {busy ? "Accepting..." : disabled ? "Offer unavailable" : "Accept this offer"}
    </button>
    {message && <p className={message.startsWith("Offer accepted") ? "success-note" : "form-error"} role="status">{message}</p>}
  </div>;
}
