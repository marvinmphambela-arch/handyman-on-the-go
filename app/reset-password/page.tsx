"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    if (password.length < 8) { setError("Your password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Your password has been updated. You can now sign in with your new password.");
      setPassword(""); setConfirmPassword("");
      window.setTimeout(() => router.push("/login"), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't update your password. Please request a new reset link.");
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
      <div className="request-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Choose a new password.</h1><p>Use at least 8 characters and keep your password private.</p></div>
      <form className="request-card form-step" onSubmit={submit}>
        <label className="field-label" htmlFor="new-password">New password</label>
        <div style={{position:"relative"}}>
          <input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} style={{width:"100%",paddingRight:"4.5rem"}} />
          <button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? "Hide password" : "Show password"} style={{position:"absolute",right:"0.75rem",top:"50%",transform:"translateY(-50%)",border:0,background:"transparent",cursor:"pointer",padding:"0.35rem",color:"inherit"}}>{showPassword ? "Hide" : "Show"}</button>
        </div>
        <label className="field-label" htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="privacy-note" role="status">{message}</p>}
        <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
      </form>
    </div>
  </main>;
}
