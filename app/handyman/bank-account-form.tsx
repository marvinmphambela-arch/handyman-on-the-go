"use client";

import { useEffect, useState, type FormEvent } from "react";

type BankAccount = {
  id: string;
  bank_name: string;
  bank_code: string;
  account_holder_name: string;
  account_type: "current" | "savings" | "transmission";
  account_number_last4: string;
  updated_at: string;
};

export default function HandymanBankAccountForm() {
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [holder, setHolder] = useState("");
  const [accountType, setAccountType] = useState<"current" | "savings" | "transmission">("savings");
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadBankAccount() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/handyman/bank-account", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not load your bank details.");
      const saved = result.bankAccount as BankAccount | null;
      setBank(saved);
      if (saved) {
        setBankName(saved.bank_name);
        setBankCode(saved.bank_code);
        setHolder(saved.account_holder_name);
        setAccountType(saved.account_type);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We could not load your bank details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBankAccount(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/handyman/bank-account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: bankName,
          bank_code: bankCode,
          account_holder_name: holder,
          account_type: accountType,
          account_number: accountNumber
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not save your bank details.");
      setBank(result.bankAccount as BankAccount);
      setAccountNumber("");
      setMessage("Your payout bank details have been saved securely. Only the last four account digits are displayed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "We could not save your bank details.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!window.confirm("Remove this bank account from your active payout details?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/handyman/bank-account", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We could not remove your bank details.");
      setBank(null);
      setBankName("");
      setBankCode("");
      setHolder("");
      setAccountNumber("");
      setAccountType("savings");
      setMessage("Your payout bank details have been deactivated.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "We could not remove your bank details.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="request-card form-step">
    <div className="eyebrow">SECURE PAYOUT DETAILS</div>
    <h3>Bank account</h3>
    <p>Add the bank account where you want approved platform payouts sent. Your full account number is encrypted before storage and is never shown again after saving.</p>
    {loading ? <p className="privacy-note">Loading your saved bank details...</p> : <>
      {bank && <div className="review-summary">
        <div className="review-row"><small>ACTIVE BANK</small><b>{bank.bank_name}</b></div>
        <div className="review-row"><small>ACCOUNT HOLDER</small><b>{bank.account_holder_name}</b></div>
        <div className="review-row"><small>ACCOUNT TYPE</small><b>{bank.account_type}</b></div>
        <div className="review-row"><small>ACCOUNT NUMBER</small><b>•••• {bank.account_number_last4}</b></div>
      </div>}
      <form onSubmit={save}>
        <label className="field-label" htmlFor="payout-bank-name">Bank name</label>
        <input id="payout-bank-name" required maxLength={100} value={bankName} onChange={event => setBankName(event.target.value)} placeholder="e.g. Standard Bank" />
        <label className="field-label" htmlFor="payout-bank-code">Bank code</label>
        <input id="payout-bank-code" required maxLength={20} value={bankCode} onChange={event => setBankCode(event.target.value)} placeholder="Bank branch / institution code" />
        <label className="field-label" htmlFor="payout-account-holder">Account holder name</label>
        <input id="payout-account-holder" required maxLength={120} value={holder} onChange={event => setHolder(event.target.value)} />
        <label className="field-label" htmlFor="payout-account-type">Account type</label>
        <select className="choice-select" id="payout-account-type" value={accountType} onChange={event => setAccountType(event.target.value as typeof accountType)}>
          <option value="current">Current</option>
          <option value="savings">Savings</option>
          <option value="transmission">Transmission</option>
        </select>
        <label className="field-label" htmlFor="payout-account-number">Account number {bank ? "(enter again to replace)" : ""}</label>
        <input id="payout-account-number" required inputMode="numeric" autoComplete="off" minLength={6} maxLength={20} value={accountNumber} onChange={event => setAccountNumber(event.target.value)} placeholder={bank ? "Enter new account number" : "Enter account number"} />
        <p className="form-hint">For security, the full account number cannot be retrieved or displayed after saving. Enter it again only when changing the account number.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="privacy-note" role="status">{message}</p>}
        <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Saving..." : bank ? "Update bank details" : "Save bank details"}</button>
      </form>
      {bank && <button className="btn btn-dark" type="button" onClick={deactivate} disabled={busy} style={{marginTop:"12px"}}>Remove payout bank account</button>}
      {!message && error && <p className="form-error" role="alert">{error}</p>}
    </>}
  </section>;
}
