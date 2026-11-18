"use client";

import { useEffect, useMemo, useState } from "react";

const zar = (amount: number) => amount.toLocaleString("en-ZA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export default function InstantWithdrawal({ availableAmount }: { availableAmount: number }) {
  const [amountInput, setAmountInput] = useState(String(availableAmount));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) setAmountInput(String(availableAmount));
  }, [availableAmount, confirming]);

  const selectedAmount = Number(amountInput);
  const amountIsValid = Number.isSafeInteger(selectedAmount)
    && selectedAmount > 0
    && selectedAmount <= availableAmount;
  const fee = useMemo(
    () => amountIsValid
      ? Math.max(Math.round((selectedAmount * 0.02 + Number.EPSILON) * 100) / 100, 5)
      : 0,
    [amountIsValid, selectedAmount]
  );
  const net = Math.max(Math.round((selectedAmount - fee) * 100) / 100, 0);

  async function submit() {
    setError(null);
    setMessage(null);
    if (!amountIsValid) {
      setError("Enter a whole-rand amount greater than zero and no more than your available balance.");
      return;
    }
    if (fee >= selectedAmount) {
      setError("This amount is too small to cover the instant withdrawal fee.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/handyman/payout/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_zar: selectedAmount })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not process the withdrawal.");
      setConfirming(false);
      setMessage(data.transferStatus === "success"
        ? "Withdrawal successful. R" + zar(Number(data.netAmountZar)) + " sent."
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
        <b>R{zar(availableAmount)}</b>
      </div>
      {!confirming ? (
        <>
          <label className="withdraw-amount-field">
            <span>Amount to withdraw (R)</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={availableAmount}
              step="1"
              value={amountInput}
              onChange={(event) => { setAmountInput(event.target.value); setError(null); setMessage(null); }}
              disabled={busy || availableAmount <= 0}
            />
          </label>
          <p className="privacy-note">Enter a whole-rand amount. The fee is 2% (minimum R5), calculated to the cent.</p>
          {error && <p className="error-note">{error}</p>}
          {message && <p className="success-note">{message}</p>}
          <button className="btn btn-orange" type="button" onClick={() => {
            setError(null);
            setMessage(null);
            if (!amountIsValid) {
              setError("Enter a whole-rand amount greater than zero and no more than your available balance.");
              return;
            }
            if (fee >= selectedAmount) {
              setError("This amount is too small to cover the instant withdrawal fee.");
              return;
            }
            setConfirming(true);
          }} disabled={availableAmount <= 0 || busy}>
            Withdraw
          </button>
        </>
      ) : (
        <div className="withdraw-confirmation">
          <h4>Withdraw R{zar(selectedAmount)}?</h4>
          <div className="review-summary">
            <div className="review-row"><small>FEE</small><b>R{zar(fee)}</b></div>
            <div className="review-row"><small>YOU RECEIVE</small><b>R{zar(net)}</b></div>
          </div>
          {error && <p className="error-note">{error}</p>}
          <div className="withdraw-actions">
            <button className="btn btn-outline-dark" type="button" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-dark" type="button" onClick={submit} disabled={busy || !amountIsValid || fee >= selectedAmount}>
              {busy ? "Processing…" : "Confirm Withdrawal"}
            </button>
          </div>
        </div>
      )}
      {availableAmount <= 0 && !message && <p className="privacy-note">No earnings available.</p>}
    </section>
  );
}
