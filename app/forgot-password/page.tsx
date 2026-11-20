"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
      });
      if (error) throw error;
      setMessage("If an account exists for that email address, a password-reset link will be sent. Please check your inbox and spam folder.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="request-page">
    <header className="request-nav"><div className="container request-nav-inner">
      <Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link>
      <Link href="/login" className="back-link">Back to sign in</Link>
    </div></header>
    <div className="container request-shell">
      <div className="request-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Reset your password.</h1><p>Enter the email address linked to your Handyman on the Go account.</p></div>
      <form className="request-card form-step" onSubmit={submit}>
        <label className="field-label" htmlFor="reset-email">Email address</label>
        <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="privacy-note" role="status">{message}</p>}
        <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
      </form>
    </div>
  </main>;
}
