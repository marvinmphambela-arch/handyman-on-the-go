import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptBankAccountNumber } from "@/lib/security/bank-account-encryption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getHandyman() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please sign in again." }, { status: 401 }) };

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (profile?.role !== "handyman") {
    return { error: NextResponse.json({ error: "Only handyman accounts can manage payout bank details." }, { status: 403 }) };
  }
  return { user };
}

function originIsAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const auth = await getHandyman();
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("handyman_bank_accounts")
      .select("id, bank_name, bank_code, account_holder_name, account_type, account_number_last4, is_active, created_at, updated_at")
      .eq("handyman_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ bankAccount: data ?? null }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Bank account retrieval failed:", error);
    return NextResponse.json({ error: "We could not load your payout bank details." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  try {
    const auth = await getHandyman();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => null);
    const bankName = typeof body?.bank_name === "string" ? body.bank_name.trim() : "";
    const bankCode = typeof body?.bank_code === "string" ? body.bank_code.trim() : "";
    const accountHolderName = typeof body?.account_holder_name === "string" ? body.account_holder_name.trim() : "";
    const accountType = typeof body?.account_type === "string" ? body.account_type : "";
    const accountNumber = typeof body?.account_number === "string" ? body.account_number.replace(/\\s+/g, "") : "";

    if (!bankName || bankName.length > 100 || !bankCode || bankCode.length > 20 ||
        !accountHolderName || accountHolderName.length > 120 ||
        !["current", "savings", "transmission"].includes(accountType) ||
        !/^\\d{6,20}$/.test(accountNumber)) {
      return NextResponse.json({ error: "Check the bank, account holder, account type and account number details." }, { status: 400 });
    }

    const ciphertext = encryptBankAccountNumber(accountNumber);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("handyman_bank_accounts")
      .upsert({
        handyman_id: auth.user.id,
        bank_name: bankName,
        bank_code: bankCode,
        account_holder_name: accountHolderName,
        account_type: accountType,
        account_number_ciphertext: ciphertext,
        account_number_last4: accountNumber.slice(-4),
        is_active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "handyman_id" })
      .select("id, bank_name, bank_code, account_holder_name, account_type, account_number_last4, is_active, updated_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ bankAccount: data }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    console.error("Bank account save failed:", error);
    return NextResponse.json({ error: "We could not save your bank details. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!originIsAllowed(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  try {
    const auth = await getHandyman();
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();
    const { error } = await admin
      .from("handyman_bank_accounts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("handyman_id", auth.user.id)
      .eq("is_active", true);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bank account deactivation failed:", error);
    return NextResponse.json({ error: "We could not remove your payout bank details." }, { status: 500 });
  }
}
