"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentMethod = "direct_eft" | "platform";

type CompletionResult = {
  already_completed?: boolean;
};

export default function ConfirmJobCompletionButton({ jobId, paymentMethod }: { jobId: string; paymentMethod: PaymentMethod }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedJobId = searchParams.get("job_id");
  const paymentReturn = returnedJobId === jobId ? searchParams.get("job_payment") : null;
  const paymentVerified = paymentReturn === "verified";
  const paymentNeedsReview = ["duplicate", "refund_required"].includes(paymentReturn || "");

  async function finishCompletion(method: PaymentMethod) {
    if (busy || paymentNeedsReview) return;
    const paymentLabel = method === "direct_eft" ? "direct EFT" : "Paystack";
    const confirmed = window.confirm(
      `Confirm that this job is complete and the customer has paid by ${paymentLabel}? The platform commission is taken from the handyman's Access Wallet first. Any remaining Direct EFT shortfall is recovered from a future verified Access Wallet top-up or platform-held job earnings, whichever happens first.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("customer_confirm_job_completion", {
      p_job_id: jobId,
      p_payment_method: method
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "We couldn't confirm completion. Please try again.");
      return;
    }

    const result = (data ?? {}) as CompletionResult;
    if (result.already_completed) {
      setMessage("This job is already marked as completed.");
    }
    router.refresh();
  }

  async function handleAction() {
    if (busy || paymentNeedsReview) return;
    if (paymentMethod === "direct_eft") {
      await finishCompletion("direct_eft");
      return;
    }

    if (paymentVerified) {
      await finishCompletion("platform");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/paystack/job-payment/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "We couldn't start the Paystack payment. Please try again.");
        setBusy(false);
        return;
      }
      if (result.alreadyPaid) {
        setBusy(false);
        await finishCompletion("platform");
        return;
      }
      if (typeof result.authorizationUrl !== "string") {
        throw new Error("Paystack did not return a checkout link.");
      }
      window.location.assign(result.authorizationUrl);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "We couldn't start the Paystack payment.");
      setBusy(false);
    }
  }

  return (
    <section className="request-card">
      <div className="eyebrow">CONFIRM COMPLETION</div>
      <h3>Has the work been completed and paid for?</h3>
      <p className="form-hint">
        Confirm only after the handyman has finished the work. For platform payments, you will pay the accepted offer amount securely through Paystack first. The customer never pays an extra commission.
      </p>
      <div className={`payment-method-badge ${paymentMethod === "platform" ? "payment-method-platform" : "payment-method-direct"}`}>
        <span className="payment-method-icon" aria-hidden="true">{paymentMethod === "platform" ? "💳" : "🏦"}</span>
        <span>{paymentMethod === "platform" ? "Platform Payment" : "Direct EFT"}</span>
      </div>
      <p className="choice-help">This payment method was selected when you posted the job and cannot be changed.</p>
      {paymentMethod === "platform" && paymentVerified && (
        <p className="success-note" role="status">
          Paystack has verified your payment. Please confirm that the work is complete to finish this job.
        </p>
      )}
      {paymentNeedsReview && (
        <p className="form-error" role="alert">
          Paystack received this payment, but it could not be applied to the job. Please contact support so the payment can be reviewed for a refund. Do not submit another payment or switch payment methods until support has reviewed it.
        </p>
      )}
      {paymentMethod === "platform" && ["failed", "error"].includes(paymentReturn || "") && (
        <p className="privacy-note" role="status">
          We could not verify that payment. You can safely try again; an unsuccessful attempt will not complete the job.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="success-note" role="status">{message}</p>}
      <button type="button" className="btn btn-orange" onClick={handleAction} disabled={busy || paymentNeedsReview}>
        {busy
          ? paymentMethod === "platform" && !paymentVerified ? "Connecting to Paystack..." : "Confirming..."
          : paymentMethod === "platform" && !paymentVerified ? "Pay with Paystack"
            : "Confirm job completed"}
      </button>
    </section>
  );
}
