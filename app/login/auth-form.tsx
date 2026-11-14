"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"customer" | "handyman">("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(searchParams.get("message") === "confirmation" ? "Please confirm your email using the link we sent you, then sign in." : "");
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
            data: { full_name: fullName.trim(), role }
          }
        });
        if (authError) throw authError;
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
          <label className="field-label" htmlFor="role">I want to join as</label><select id="role" value={role} onChange={e=>setRole(e.target.value as "customer"|"handyman")}><option value="customer">Customer — I need help with a job</option><option value="handyman">Handyman — I offer services</option></select></>}
        <label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} />
        <label className="field-label" htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="privacy-note" role="status">{message}</p>}
        <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}</button>
        <p className="form-hint">{mode === "signup" ? "Already registered? " : "New to Handyman On The Go? "}<Link href={mode === "signup" ? "/login" : "/signup"}>{mode === "signup" ? "Sign in" : "Create an account"}</Link></p>
      </form>
    </div></main>;
}
