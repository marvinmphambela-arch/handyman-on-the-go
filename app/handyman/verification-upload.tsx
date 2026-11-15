"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default function VerificationUpload({ handymanId, existingStatus }: { handymanId: string; existingStatus: string | null }) {
  const router = useRouter();
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const alreadySubmitted = existingStatus !== null;

  function validate(file: File | null, label: string) {
    if (!file) return label + " is required.";
    if (!ACCEPTED_TYPES.includes(file.type)) return label + " must be a PDF, JPG, PNG or WebP file.";
    if (file.size > MAX_FILE_SIZE) return label + " must be 10 MB or smaller.";
    return "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idError = validate(idDocument, "Your identity document");
    const selfieError = validate(selfie, "Your verification selfie");
    if (idError || selfieError) { setError(idError || selfieError); return; }

    setBusy(true); setError(""); setMessage("");
    const supabase = createClient();
    const stamp = Date.now();
    const idPath = handymanId + "/identity-" + stamp + "-" + idDocument!.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const selfiePath = handymanId + "/selfie-" + stamp + "-" + selfie!.name.replace(/[^a-zA-Z0-9._-]/g, "-");

    const idUpload = await supabase.storage.from("handyman-verification").upload(idPath, idDocument!, { upsert: false });
    if (idUpload.error) { setError("We could not upload your identity document: " + idUpload.error.message); setBusy(false); return; }

    const selfieUpload = await supabase.storage.from("handyman-verification").upload(selfiePath, selfie!, { upsert: false });
    if (selfieUpload.error) {
      await supabase.storage.from("handyman-verification").remove([idPath]);
      setError("We could not upload your selfie: " + selfieUpload.error.message);
      setBusy(false); return;
    }

    const { error: saveError } = await supabase.rpc("submit_handyman_verification", {
      p_id_document_path: idPath,
      p_selfie_path: selfiePath
    });

    if (saveError) {
      await supabase.storage.from("handyman-verification").remove([idPath, selfiePath]);
      setError("Your files uploaded, but the submission could not be saved. Please contact support. " + saveError.message);
    } else {
      setMessage("Your verification has been submitted. Our team will respond within 12 hours.");
      setIdDocument(null); setSelfie(null); router.refresh();
    }
    setBusy(false);
  }

  if (alreadySubmitted) {
    const label = existingStatus === "approved" ? "Your verification is approved." : existingStatus === "rejected" ? "Your previous submission was not approved. Please contact support for next steps." : "Your documents have been submitted and are awaiting review.";
    return <section className="request-card"><div className="eyebrow">IDENTITY VERIFICATION</div><h2>Verification submission</h2><p>{label}</p><p className="form-hint">Your identity document and selfie are stored in private storage. Only authorised administrators can access them.</p></section>;
  }

  return <form className="request-card form-step" onSubmit={submit}>
    <div className="eyebrow">IDENTITY VERIFICATION</div>
    <h2>Submit your verification</h2>
    <p>Upload a clear image or PDF of your South African identity document, plus a separate selfie of yourself.</p>
    <label className="field-label" htmlFor="verification-id">Identity document</label>
    <input id="verification-id" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required onChange={e=>setIdDocument(e.target.files?.[0] ?? null)} />
    <p className="form-hint">Accepted: PDF, JPG, PNG or WebP. Maximum 10 MB.</p>
    <label className="field-label" htmlFor="verification-selfie">Separate verification selfie</label>
    <input id="verification-selfie" type="file" accept="image/jpeg,image/png,image/webp" required onChange={e=>setSelfie(e.target.files?.[0] ?? null)} />
    <p className="form-hint">Use a recent, clear photo showing your face. Maximum 10 MB.</p>
    <p className="form-hint">These files are private and can only be accessed by authorised administrators. They are not shown to customers or other handymen.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="privacy-note" role="status">{message}</p>}
    <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Submitting securely..." : "Submit verification"}</button>
  </form>;
}
