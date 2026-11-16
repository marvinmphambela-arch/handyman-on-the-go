"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentMethod = "direct_eft" | "platform";

type CompletionResult = {
  commission_amount_zar?: number;
  net_earnings_zar?: number;
  already_completed?: boolean;
  commission_status?: "posted" | "pending" | "not_applicable";
};

export default function ConfirmJobCompletionButton({ jobId }: { jobId: string }) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("direct_eft");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function confirmCompletion() {
    if (busy) return;
    const paymentLabel = paymentMethod === "direct_eft" ? "direct EFT" : "the platform";
    const confirmed = window.confirm(
      `Confirm that this job is complete and the customer has paid by ${paymentLabel}? The 10% commission will be collected from the handyman's Access Wallet.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("customer_confirm_job_completion", {
      p_job_id: jobId,
      p_payment_method: paymentMethod
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "We couldn't confirm completion. Please try again.");
      return;
    }

    const result = (data ?? {}) as CompletionResult;
    const commissionAmount = Number(result.commission_amount_zar ?? 0).toLocaleString("en-ZA");
    setMessage(
      result.already_completed
        ? "This job was already marked completed. No additional commission was charged."
        : result.commission_status === "pending"
          ? `Job completed. The R${commissionAmount} commission is outstanding and will be collected automatically from the handyman's next verified wallet top-up.`
          : result.commission_status === "not_applicable"
            ? "Job completed. No commission was due under the current platform settings."
            : `Job completed. R${commissionAmount} commission collected from the handyman's Access Wallet.`
    );
    router.refresh();
  }

  return (
    <section className="request-card">
      <div className="eyebrow">CONFIRM COMPLETION</div>
      <h3>Has the work been completed and paid for?</h3>
      <p className="form-hint">
        Confirm only after the handyman has finished the work and you have paid. The platform will collect its 10% commission from the handyman's Access Wallet.
      </p>
      <label className="field-label" htmlFor={`payment-method-${jobId}`}>How did you pay?</label>
      <select
        id={`payment-method-${jobId}`}
        value={paymentMethod}
        onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}
        disabled={busy}
      >
        <option value="direct_eft">Direct EFT to the handyman</option>
        <option value="platform">Through Handyman On The Go</option>
      </select>
      {paymentMethod === "platform" && (
        <p className="privacy-note">
          Platform job-payment processing is not connected yet. This records your payment-method confirmation; it does not charge your card or verify a platform payment.
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="success-note" role="status">{message}</p>}
      <button type="button" className="btn btn-orange" onClick={confirmCompletion} disabled={busy}>
        {busy ? "Confirming..." : "Confirm job completed"}
      </button>
    </section>
  );
}
