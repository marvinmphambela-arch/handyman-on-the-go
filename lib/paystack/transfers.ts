import "server-only";

const PAYSTACK_API = "https://api.paystack.co";

function getTransferSecretKey() {
  const key = process.env.PAYSTACK_TRANSFER_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_TRANSFER_SECRET_KEY is not configured.");
  return key;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getTransferSecretKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status) {
    const message = typeof body?.message === "string" ? body.message : "Paystack request failed.";
    const error = new Error(message);
    (error as Error & { status?: number; paystackBody?: unknown }).status = response.status;
    (error as Error & { status?: number; paystackBody?: unknown }).paystackBody = body;
    throw error;
  }

  return body as T;
}

export type PaystackRecipientResponse = {
  status: true;
  message: string;
  data: {
    recipient_code: string;
    active: boolean;
    type: string;
    currency: string;
    details?: {
      account_number?: string | null;
      account_name?: string | null;
      bank_code?: string | null;
      bank_name?: string | null;
    };
  };
};

export async function createSouthAfricaRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
  description?: string;
}) {
  return paystackRequest<PaystackRecipientResponse>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "basa",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "ZAR",
      description: input.description ?? "Handyman On The Go payout recipient"
    })
  });
}

export type PaystackTransferResponse = {
  status: true;
  message: string;
  data: {
    reference: string;
    transfer_code: string | null;
    amount: number;
    currency: string;
    status: "pending" | "success" | "otp" | "failed" | "reversed" | string;
    failures?: unknown;
  };
};

export async function initiateSouthAfricaTransfer(input: {
  amountZar: number;
  recipientCode: string;
  reference: string;
  reason: string;
}) {
  return paystackRequest<PaystackTransferResponse>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: input.amountZar * 100,
      currency: "ZAR",
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason
    })
  });
}
