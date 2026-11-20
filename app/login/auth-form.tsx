"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"customer" | "handyman">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("message") === "confirmation") {
      setMessage("Please confirm your email using the link we sent you, then sign in.");
    }
  }, []);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: { full_name: fullName.trim(), phone: phone.trim(), role }
          }
        });
        if (authError) throw authError;
        if (data.user?.identities?.length === 0) {
          setError("An account with this email address already exists. Please sign in instead.");
          return;
        }
        if (data.session) router.push("/account");
        else setMessage("Account created. Check your email for a confirmation link before signing in.");
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push("/account");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="request-page"><header className="request-nav"><div className="container request-nav-inner"><Link className="brand" href="/"><span className="brand-mark"><span className="brand-monogram">HGO</span><span className="brand-underline"/></span><span className="brand-name">Handyman <span className="brand-accent">On The Go</span><sup>™</sup></span></Link><Link href="/" className="back-link">Back to home</Link></div></header>
    <div className="container request-shell"><div className="request-heading"><div className="eyebrow">YOUR HANDYMAN ON THE GO ACCOUNT</div><h1>{mode === "signup" ? "Join the community." : "Welcome back."}</h1><p>{mode === "signup" ? "Create an account to get started as a customer or handyman." : "Sign in to continue to your account."}</p></div>
      <form className="request-card form-step" onSubmit={submit}>
        {mode === "signup" && <><label className="field-label" htmlFor="full-name">Full name</label><input id="full-name" autoComplete="name" required value={fullName} onChange={e=>setFullName(e.target.value)} maxLength={100} />
          <label className="field-label" htmlFor="phone">Phone number</label><input id="phone" type="tel" autoComplete="tel" placeholder="+27..." required minLength={7} maxLength={25} value={phone} onChange={e=>setPhone(e.target.value)} />
          <fieldset className="choice-fieldset"><legend className="field-label">I want to join as</legend><p className="choice-help">Choose the type of account you want to create.</p><label className={role === "customer" ? "choice-card selected" : "choice-card"}><input type="radio" name="account-role" value="customer" checked={role === "customer"} onChange={() => setRole("customer")} /><span className="choice-card-copy"><strong>Customer</strong><small>I need help with a job.</small></span><span className="choice-indicator" aria-hidden="true" /></label><label className={role === "handyman" ? "choice-card selected" : "choice-card"}><input type="radio" name="account-role" value="handyman" checked={role === "handyman"} onChange={() => setRole("handyman")} /><span className="choice-card-copy"><strong>Handyman</strong><small>I offer home services.</small></span><span className="choice-indicator" aria-hidden="true" /></label></fieldset></>}
        <label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="field-label" htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} style={{ width: "100%", paddingRight: "4.5rem" }} />
          <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", border: 0, background: "transparent", cursor: "pointer", padding: "0.35rem", color: "inherit", fontSize: "0.875rem" }}>
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="privacy-note" role="status">{message}</p>}
        <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
        <p className="form-hint">{mode === "signup" ? "Already registered? " : "New to Handyman On The Go? "}<Link href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p>
      </form>
    </div></main>;
}
