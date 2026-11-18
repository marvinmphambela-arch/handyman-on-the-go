"use client";

import { useMemo, useState } from "react";

export default function InstantWithdrawal({ availableAmount }: { availableAmount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fee = useMemo(() => availableAmount > 0 ? Math.max(Math.ceil(availableAmount * 0.02), 5) : 0, [availableAmount]);
  const net = Math.max(availableAmount - fee, 0);

  async function submit() {
    setError(null);
    setMessage(null);
    if (!Number.isSafeInteger(availableAmount) || availableAmount <= 0) {
      setError("No earnings are available to withdraw.");
      return;
    }
    if (fee >= availableAmount) {
      setError("Your available amount is too small to withdraw.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/handyman/payout/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_zar: availableAmount })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not process the withdrawal.");
      setConfirming(false);
      setMessage(data.transferStatus === "success"
        ? "Withdrawal successful. R" + Number(data.netAmountZar).toLocaleString("en-ZA") + " sent."
        : "Withdrawal submitted and is being processed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not process the withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="request-card earnings-withdraw-card">
      <h3>Withdraw Earnings</h3>
      <div className="earnings-withdraw-meta">
        <span>Available</span>
        <b>R{availableAmount.toLocaleString("en-ZA")}</b>
      </div>
      {!confirming ? (
        <>
          {error && <p className="error-note">{error}</p>}
          {message && <p className="success-note">{message}</p>}
          <button className="btn btn-orange" type="button" onClick={() => { setError(null); setMessage(null); setConfirming(true); }} disabled={availableAmount <= 0 || busy}>
            Withdraw
          </button>
        </>
      ) : (
        <div className="withdraw-confirmation">
          <h4>Withdraw R{availableAmount.toLocaleString("en-ZA")}?</h4>
          <div className="review-summary">
            <div className="review-row"><small>FEE</small><b>R{fee.toLocaleString("en-ZA")}</b></div>
            <div className="review-row"><small>YOU RECEIVE</small><b>R{net.toLocaleString("en-ZA")}</b></div>
          </div>
          {error && <p className="error-note">{error}</p>}
          <div className="withdraw-actions">
            <button className="btn btn-outline-dark" type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-dark" type="button" onClick={submit} disabled={busy}>
              {busy ? "Processing…" : "Confirm Withdrawal"}
            </button>
          </div>
        </div>
      )}
      {availableAmount <= 0 && !message && <p className="privacy-note">No earnings available.</p>}
    </section>
  );
}
