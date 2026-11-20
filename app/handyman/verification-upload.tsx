"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

type CaptureKind = "selfie" | "identity";

export default function VerificationUpload({ handymanId, existingStatus }: { handymanId: string; existingStatus: string | null }) {
  const router = useRouter();
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [captureKind, setCaptureKind] = useState<CaptureKind | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const alreadySubmitted = existingStatus !== null;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => setCameraError("Please allow camera access and try again."));
    }
  }, [stream, captureKind]);

  useEffect(() => () => {
    stream?.getTracks().forEach(track => track.stop());
  }, [stream]);

  function closeCamera() {
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
    setCaptureKind(null);
    setCameraError("");
    setCameraBusy(false);
  }

  async function openCamera(kind: CaptureKind) {
    setCaptureKind(kind);
    setCameraError("");
    setCameraBusy(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser. Please use Upload from device instead.");
      setCameraBusy(false);
      return;
    }
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: kind === "selfie" ? "user" : "environment" }
      });
      setStream(cameraStream);
    } catch {
      setCameraError("We could not access your camera. Check your browser permission and use Upload from device if needed.");
    } finally {
      setCameraBusy(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || !captureKind) {
      setCameraError("The camera is not ready yet. Please wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("We could not capture the photo. Please try again or upload a file.");
      return;
    }
    if (captureKind === "selfie") {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setCameraError("We could not prepare the photo. Please try again.");
      return;
    }
    const photo = new File([blob], `hgo-${captureKind}-${Date.now()}.jpg`, { type: "image/jpeg" });
    if (captureKind === "selfie") setSelfie(photo);
    else setIdDocument(photo);
    closeCamera();
  }

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

  const cameraTitle = captureKind === "selfie" ? "Take your verification selfie" : "Photograph your ID";
  return <>
    <form className="request-card form-step" onSubmit={submit}>
      <div className="eyebrow">IDENTITY VERIFICATION</div>
      <h2>Submit your verification</h2>
      <p>Use the guided camera for the clearest result, or upload an existing photo from your device.</p>

      <section className="verification-capture-card">
        <div className="verification-capture-heading"><div><div className="eyebrow">STEP 1</div><h3>Identity document</h3></div><span aria-hidden="true">▤</span></div>
        <p>Place your South African ID inside the frame. Make sure all four corners and the details are visible, with no glare.</p>
        <button className="btn btn-dark" type="button" onClick={() => void openCamera("identity")}>Open ID camera</button>
        <label className="field-label" htmlFor="verification-id">Or upload from device</label>
        <input id="verification-id" type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e=>setIdDocument(e.target.files?.[0] ?? null)} />
        <p className="form-hint">{idDocument ? "Selected: " + idDocument.name : "Accepted: PDF, JPG, PNG or WebP. Maximum 10 MB."}</p>
      </section>

      <section className="verification-capture-card">
        <div className="verification-capture-heading"><div><div className="eyebrow">STEP 2</div><h3>Live selfie</h3></div><span aria-hidden="true">◎</span></div>
        <p>Look directly at the camera, remove sunglasses and keep your face inside the circular guide.</p>
        <button className="btn btn-dark" type="button" onClick={() => void openCamera("selfie")}>Open selfie camera</button>
        <label className="field-label" htmlFor="verification-selfie">Or upload from device</label>
        <input id="verification-selfie" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setSelfie(e.target.files?.[0] ?? null)} />
        <p className="form-hint">{selfie ? "Selected: " + selfie.name : "Use a recent, clear photo showing your face. Maximum 10 MB."}</p>
      </section>

      <p className="form-hint">Your files are private and can only be accessed by authorised administrators. They are not shown to customers or other handymen.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="privacy-note" role="status">{message}</p>}
      <button className="btn btn-orange" type="submit" disabled={busy}>{busy ? "Submitting securely..." : "Submit verification"}</button>
    </form>

    {captureKind && <div className="verification-camera-backdrop" role="dialog" aria-modal="true" aria-label={cameraTitle}>
      <section className="verification-camera-dialog">
        <div className="verification-camera-top"><div><div className="eyebrow">GUIDED CAPTURE</div><h2>{cameraTitle}</h2></div><button type="button" className="verification-camera-close" onClick={closeCamera} aria-label="Close camera">×</button></div>
        <p className="form-hint">{captureKind === "selfie" ? "Centre your face in the circle and look straight at the camera." : "Fit the whole ID inside the rectangle. Avoid shadows and reflections."}</p>
        <div className="verification-camera-view">
          {stream ? <video ref={videoRef} autoPlay muted playsInline /> : <div className="verification-camera-placeholder">{cameraBusy ? "Opening camera..." : "Camera preview unavailable"}</div>}
          {stream && <div className={captureKind === "selfie" ? "verification-face-guide" : "verification-id-guide"} aria-hidden="true" />}
        </div>
        {cameraError && <p className="form-error" role="alert">{cameraError}</p>}
        <div className="verification-camera-actions">
          <button className="btn btn-dark" type="button" onClick={closeCamera}>Cancel</button>
          <button className="btn btn-orange" type="button" onClick={() => void capturePhoto()} disabled={!stream || cameraBusy}>Capture photo</button>
        </div>
        <p className="form-hint">Your browser may ask for camera permission. Camera access requires a secure connection (HTTPS).</p>
      </section>
    </div>}
    <style jsx>{`
      .verification-capture-card{border:1px solid #dce4ef;border-radius:16px;padding:20px;margin:20px 0;background:#f8fafc}
      .verification-capture-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .verification-capture-heading h3{margin:4px 0 8px}.verification-capture-heading>span{font-size:28px;color:#174a83}
      .verification-capture-card>p{margin:8px 0 14px}.verification-capture-card .btn{margin-bottom:14px}
      .verification-capture-card input{display:block;width:100%;max-width:100%}
      .verification-camera-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(8,20,38,.82);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}
      .verification-camera-dialog{width:min(100%,560px);background:#fff;border-radius:20px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28);max-height:calc(100vh - 32px);overflow-y:auto}
      .verification-camera-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.verification-camera-top h2{margin:4px 0 8px}
      .verification-camera-close{border:0;background:#edf2f7;color:#17324f;border-radius:50%;width:40px;height:40px;font-size:28px;line-height:1;cursor:pointer;flex:none}
      .verification-camera-view{position:relative;width:100%;aspect-ratio:4/3;background:#101827;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .verification-camera-view video{width:100%;height:100%;object-fit:cover}
      .verification-camera-placeholder{color:#fff;padding:24px;text-align:center}
      .verification-face-guide{position:absolute;width:min(62%,260px);height:82%;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 999px rgba(0,0,0,.25);pointer-events:none}
      .verification-id-guide{position:absolute;width:86%;aspect-ratio:1.586;border:3px solid #fff;border-radius:12px;box-shadow:0 0 0 999px rgba(0,0,0,.28);pointer-events:none}
      .verification-camera-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px}
      @media(max-width:480px){.verification-camera-dialog{padding:16px}.verification-camera-actions .btn{flex:1}.verification-capture-card{padding:16px}}
    `}</style>
  </>;
}
