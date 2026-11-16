"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PaymentMethod = "platform" | "direct_eft";

export default function ConfirmJobCompletionButton({ jobId }: { jobId: string }) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("direct_eft");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function confirmCompletion() {
    if (busy) return;
    const paymentLabel = paymentMethod === "platform" ? "platform payment" : "direct EFT";
    const confirmed = window.confirm(
      `Confirm that the work is complete and the customer paid by ${paymentLabel}? This records the payment method; it does not charge you or verify a platform payment.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("customer_confirm_job_completion", {
      p_job_id: jobId,
      p_payment_method: paymentMethod
    });
    setBusy(false);

    if (error) {
      setMessage(error.message || "We couldn't confirm this job's completion. Please try again.");
      return;
    }

    const commissionStatus = data?.commission_status;
    setMessage(
      commissionStatus === "pending"
        ? "Job completed. The 10% commission is recorded as outstanding and will be collected automatically from the handyman's next verified wallet top-up."
        : "Job completed successfully. The 10% commission has been collected from the handyman's Access Wallet."
    );
    router.refresh();
  }

  return (
    <section className="request-card" aria-label="Confirm job completion">
      <div className="eyebrow">JOB COMPLETION</div>
      <h3>Confirm the work is complete</h3>
      <p>Select how you paid the handyman. This records the payment method only; it does not charge you or verify a platform payment.</p>
      <label className="field-label" htmlFor={`completion-payment-${jobId}`}>Payment method</label>
      <select
        id={`completion-payment-${jobId}`}
        value={paymentMethod}
        onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}
        disabled={busy}
      >
        <option value="direct_eft">Paid directly (EFT / cash)</option>
        <option value="platform">Paid through the platform</option>
      </select>
      <button type="button" className="btn btn-orange" onClick={confirmCompletion} disabled={busy}>
        {busy ? "Confirming..." : "Confirm job completed"}
      </button>
      {message && <p className={message.startsWith("Job completed") ? "success-note" : "form-error"} role="status">{message}</p>}
    </section>
  );
}
