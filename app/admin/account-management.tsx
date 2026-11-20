"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ManagedAccount = {
  id: string;
  role: "customer" | "handyman";
  full_name: string | null;
  phone: string | null;
  created_at: string;
  account_status: "active" | "suspended";
  verification_status: string | null;
};

export default function AccountManagement({ customers, handymen }: {
  customers: ManagedAccount[];
  handymen: ManagedAccount[];
}) {
  const [tab, setTab] = useState<"customers" | "handymen">("customers");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const accounts = tab === "customers" ? customers : handymen;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter(account =>
      (account.full_name ?? "").toLowerCase().includes(term) ||
      (account.phone ?? "").toLowerCase().includes(term)
    );
  }, [accounts, search]);

  async function changeStatus(account: ManagedAccount) {
    if (busyId) return;
    const nextStatus = account.account_status === "active" ? "suspended" : "active";
    let reason = "";
    if (nextStatus === "suspended") {
      const entered = window.prompt("Why are you suspending this account? This reason will be recorded in the admin audit log.");
      if (entered === null) return;
      reason = entered.trim();
      if (!reason) {
        setError("Please provide a reason before suspending an account.");
        return;
      }
    } else {
      reason = "Account reactivated by administrator";
      if (!window.confirm("Reactivate this account and allow it to use marketplace features again?")) return;
    }

    setBusyId(account.id);
    setError("");
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("admin_set_account_status", {
      p_account_id: account.id,
      p_new_status: nextStatus,
      p_reason: reason
    });
    setBusyId("");
    if (actionError) {
      setError(actionError.message);
      return;
    }
    router.refresh();
  }

  return <section className="request-card">
    <div className="eyebrow">ACCOUNT ADMINISTRATION</div>
    <h2>Customer &amp; handyman accounts</h2>
    <p>Search accounts, review their status, and temporarily suspend or reactivate marketplace access. Existing bookings, payment records, wallet balances and payouts are preserved.</p>
    <div className="button-row" style={{ marginTop: 18 }}>
      <button type="button" className={tab === "customers" ? "btn btn-orange" : "btn btn-outline-dark"} onClick={() => { setTab("customers"); setSearch(""); setError(""); }}>Customers ({customers.length})</button>
      <button type="button" className={tab === "handymen" ? "btn btn-orange" : "btn btn-outline-dark"} onClick={() => { setTab("handymen"); setSearch(""); setError(""); }}>Handymen ({handymen.length})</button>
    </div>
    <label className="field-label" htmlFor="account-search" style={{ display: "block", marginTop: 18 }}>Search by name or phone</label>
    <input id="account-search" className="form-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Enter a name or phone number" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
      {filtered.map(account => <article key={account.id} style={{ border: "1px solid #e7e7e7", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: 0 }}>{account.full_name || (tab === "customers" ? "Customer" : "Handyman")}</h3>
            <p style={{ margin: "5px 0" }}>{account.phone || "No phone number supplied"}</p>
            <p className="form-hint">Registered {new Date(account.created_at).toLocaleDateString("en-ZA", { dateStyle: "medium" })}</p>
            {tab === "handymen" && <p className="form-hint">Identity verification: {(account.verification_status || "pending").replaceAll("_", " ")}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="eyebrow">{account.account_status === "active" ? "ACTIVE ACCOUNT" : "SUSPENDED ACCOUNT"}</span>
            <div style={{ marginTop: 10 }}>
              <button type="button" className={account.account_status === "active" ? "btn btn-outline-dark" : "btn btn-orange"} disabled={busyId === account.id || !!busyId} onClick={() => changeStatus(account)}>
                {busyId === account.id ? "Saving..." : account.account_status === "active" ? "Suspend account" : "Reactivate account"}
              </button>
            </div>
          </div>
        </div>
      </article>)}
      {filtered.length === 0 && <p className="form-hint">No {tab} accounts match this search.</p>}
    </div>
    <p className="form-hint" style={{ marginTop: 14 }}>Suspended accounts cannot create new jobs or submit new offers. Existing bookings and financial records remain available.</p>
  </section>;
}
