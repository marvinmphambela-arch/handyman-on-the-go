"use client";

import { useEffect, useState } from "react";

export default function AccessWalletTopup() {
  const [amount, setAmount] = useState("100");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("topup");
    const messages: Record<string, string> = {
      success: "Payment verified. Your Access Wallet has been credited.",
      not_verified: "Paystack has not confirmed a successful payment. Your wallet was not credited.",
      mismatch: "We could not match this payment to your wallet top-up. Please contact support.",
      invalid: "The payment reference was missing or invalid. Your wallet was not credited.",
      error: "We could not verify the payment. Your wallet was not credited; please contact support if you were charged."
    };
    if (status && messages[status]) setNotice(messages[status]);
  }, []);

  async function startTopup() {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount) })
      });
      const result = await response.json();
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "Could not start payment.");
      window.location.assign(result.authorizationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start payment. Please try again.");
      setLoading(false);
    }
  }

  return <div className="form-stack">
    {notice && <p className="success-note" role="status">{notice}</p>}
    <label htmlFor="wallet-topup-amount">Top-up amount (ZAR)</label>
    <input id="wallet-topup-amount" type="number" min="100" max="100000" step="1" value={amount} onChange={e => setAmount(e.target.value)} />
    <p className="form-hint">Minimum R100. Test mode only — no real money will be collected.</p>
    {error && <p className="error-note" role="alert">{error}</p>}
    <button className="btn btn-orange" type="button" disabled={loading || !Number.isSafeInteger(Number(amount)) || Number(amount) < 100 || Number(amount) > 100000} onClick={startTopup}>
      {loading ? "Connecting to Paystack…" : "Top up Access Wallet"}
    </button>
  </div>;
}
