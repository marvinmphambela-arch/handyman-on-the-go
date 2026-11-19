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
      <div className="withdraw-heading">
        <div>
          <div className="eyebrow">INSTANT PAYOUT</div>
          <h3>Withdraw earnings</h3>
          <p>Choose how much of your available platform earnings you want to withdraw.</p>
        </div>
        <span className="withdraw-heading-icon" aria-hidden="true">↗</span>
      </div>

      <div className="withdraw-available-panel">
        <span>AVAILABLE BALANCE</span>
        <strong>R{zar(availableAmount)}</strong>
        <small>Platform earnings ready to withdraw</small>
      </div>

      {!confirming ? (
        <div className="withdraw-entry">
          <label className="withdraw-amount-field">
            <span>Amount to withdraw</span>
            <div className="withdraw-input-wrap">
              <span aria-hidden="true">R</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={availableAmount}
                step="1"
                value={amountInput}
                onChange={(event) => { setAmountInput(event.target.value); setError(null); setMessage(null); }}
                disabled={busy || availableAmount <= 0}
                aria-label="Amount to withdraw in rand"
              />
            </div>
          </label>
          <div className="withdraw-fee-note">
            <span>Withdrawal fee</span>
            <b>2% <small>(minimum R5)</small></b>
          </div>
          <p className="withdraw-helper">Enter a whole-rand amount. Your fee is calculated to the cent and shown before you confirm.</p>
          {error && <p className="error-note" role="alert">{error}</p>}
          {message && <p className="success-note" role="status">{message}</p>}
          <button className="btn btn-orange withdraw-primary" type="button" onClick={() => {
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
            Review withdrawal <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="withdraw-confirmation">
          <div className="withdraw-confirmation-heading">
            <span>REVIEW YOUR WITHDRAWAL</span>
            <h4>Withdraw R{zar(selectedAmount)}?</h4>
          </div>
          <div className="withdraw-breakdown">
            <div><span>Withdrawal amount</span><b>R{zar(selectedAmount)}</b></div>
            <div><span>Instant withdrawal fee</span><b>R{zar(fee)}</b></div>
            <div className="withdraw-net-row"><span>You receive</span><strong>R{zar(net)}</strong></div>
          </div>
          <p className="withdraw-helper">Please check the amount and fee before confirming. Your payout will be sent to your saved bank account.</p>
          {error && <p className="error-note" role="alert">{error}</p>}
          <div className="withdraw-actions">
            <button className="btn btn-outline-dark" type="button" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
            <button className="btn btn-dark" type="button" onClick={submit} disabled={busy || !amountIsValid || fee >= selectedAmount}>
              {busy ? "Processing…" : "Confirm withdrawal"}
            </button>
          </div>
        </div>
      )}
      {availableAmount <= 0 && !message && <p className="withdraw-empty-note">No platform earnings are currently available to withdraw.</p>}
    </section>
  );
}
