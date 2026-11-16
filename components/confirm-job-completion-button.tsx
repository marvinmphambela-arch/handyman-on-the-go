"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentMethod = "direct_eft" | "platform";

type CompletionResult = {
  commission_total_zar?: number;
  commission_wallet_amount_zar?: number;
  commission_shortfall_zar?: number;
  commission_carryforward_deducted_zar?: number;
  commission_amount_zar?: number;
  net_earnings_zar?: number;
  already_completed?: boolean;
  commission_status?: string;
};

const zar = (amount: number) => Number(amount || 0).toLocaleString("en-ZA");

export default function ConfirmJobCompletionButton({ jobId }: { jobId: string }) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("direct_eft");
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
      `Confirm that this job is complete and the customer has paid by ${paymentLabel}? The platform commission is taken from the handyman's Access Wallet first. Any remaining Direct EFT shortfall is carried forward to the next platform-held job earnings.`
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
      setMessage("This job was already marked completed. No additional commission was charged.");
      router.refresh();
      return;
    }

    const total = Number(result.commission_total_zar ?? 0);
    const wallet = Number(result.commission_wallet_amount_zar ?? 0);
    const shortfall = Number(result.commission_shortfall_zar ?? 0);
    const carryforward = Number(result.commission_carryforward_deducted_zar ?? 0);
    const earningsDeduction = Number(result.commission_amount_zar ?? 0);
    const net = Number(result.net_earnings_zar ?? 0);

    if (total === 0) {
      setMessage("Job completed. No commission was due under the current platform settings.");
    } else if (method === "direct_eft") {
      setMessage(
        `Job completed. Total commission: R${zar(total)}. Access Wallet contribution: R${zar(wallet)}. Direct EFT shortfall carried forward: R${zar(shortfall)}. The customer's direct payment remains R${zar(net)}; the shortfall will be recovered from future platform-held earnings, not from a wallet top-up.`
      );
    } else {
      setMessage(
        `Job completed. Total commission: R${zar(total)}. Access Wallet contribution: R${zar(wallet)}. Deducted from this job's platform-held earnings: R${zar(earningsDeduction)} (including R${zar(carryforward)} from earlier Direct EFT jobs). Net earnings recorded: R${zar(net)}.`
      );
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
      <label className="field-label" htmlFor={`payment-method-${jobId}`}>How are you paying?</label>
      <select
        id={`payment-method-${jobId}`}
        value={paymentMethod}
        onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}
        disabled={busy}
      >
        <option value="direct_eft">Direct EFT to the handyman</option>
        <option value="platform">Through Handyman On The Go (Paystack)</option>
      </select>
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
