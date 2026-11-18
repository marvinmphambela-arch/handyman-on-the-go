"use client";

import { useMemo, useState } from "react";

export default function InstantWithdrawal({ availableAmount }: { availableAmount: number }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gross = Number(amount);
  const fee = useMemo(() => {
    if (!Number.isSafeInteger(gross) || gross <= 0) return 0;
    return Math.max(Math.ceil(gross * 0.02), 5);
  }, [gross]);
  const net = gross > fee ? gross - fee : 0;

  async function submit() {
    setError(null);
    setMessage(null);
    if (!Number.isSafeInteger(gross) || gross <= 0) {
      setError("Enter a whole-rand withdrawal amount.");
      return;
    }
    if (gross > availableAmount) {
      setError("That amount is greater than your currently eligible earnings.");
      return;
    }
    if (fee >= gross) {
      setError("This amount is too small after the R5 minimum fee.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/handyman/payout/instant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_zar: gross })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not process the withdrawal.");
      setMessage(
        data.transferStatus === "success"
          ? `Test withdrawal successful. R${Number(data.netAmountZar).toLocaleString("en-ZA")} was sent in test mode.`
          : "Your withdrawal was submitted in Paystack test mode and is being processed."
      );
      setAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not process the withdrawal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="request-card earnings-withdraw-card">
      <div className="eyebrow">INSTANT WITHDRAWAL · TEST MODE</div>
      <h3>Withdraw eligible earnings</h3>
      <p className="privacy-note">
        Withdraw any eligible platform earnings before Monday. A 2% fee applies, with a minimum fee of R5.
        Direct-payment earnings are not included.
      </p>
      <div className="earnings-withdraw-meta">
        <span>Eligible now</span>
        <b>R{availableAmount.toLocaleString("en-ZA")}</b>
      </div>
      <div className="form-field">
        <label htmlFor="instant-withdrawal-amount">Amount to withdraw</label>
        <input
          id="instant-withdrawal-amount"
          inputMode="numeric"
          pattern="[0-9]*"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
          placeholder="e.g. 500"
          disabled={busy || availableAmount <= 0}
        />
      </div>
      {gross > 0 && (
        <div className="review-summary">
          <div className="review-row"><small>INSTANT FEE</small><b>R{fee.toLocaleString("en-ZA")}</b></div>
          <div className="review-row"><small>YOU RECEIVE</small><b>R{net.toLocaleString("en-ZA")}</b></div>
        </div>
      )}
      {error && <p className="error-note">{error}</p>}
      {message && <p className="success-note">{message}</p>}
      <button className="btn btn-dark" type="button" onClick={submit} disabled={busy || availableAmount <= 0}>
        {busy ? "Processing…" : "Withdraw instantly"}
      </button>
      {availableAmount <= 0 && <p className="privacy-note">No eligible platform earnings are available for instant withdrawal yet.</p>}
    </section>
  );
}
