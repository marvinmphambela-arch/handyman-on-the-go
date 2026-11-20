"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type Rate = {
  id: string; service_category_id: string; service_name: string; region: string;
  complexity: "simple" | "standard" | "complex"; hourly_rate_zar: number;
  callout_fee_zar: number; travel_fee_zar: number; emergency_multiplier: number;
  illustrative: boolean; active: boolean; version: string; updated_at: string;
};

const blank = {
  id: "", service_category_id: "", region: "Gauteng", complexity: "standard" as const,
  hourly_rate_zar: "0", callout_fee_zar: "0", travel_fee_zar: "0",
  emergency_multiplier: "1", version: "draft", illustrative: true
};

export default function FairPriceCatalogue({ categories, initialRates, loadError }: {
  categories: Category[]; initialRates: Rate[]; loadError?: string;
}) {
  const [rates, setRates] = useState(initialRates);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(loadError || "");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const editing = Boolean(form.id);

  const update = (key: keyof typeof blank, value: string | boolean) =>
    setForm(current => ({ ...current, [key]: value }));

  function edit(rate: Rate) {
    setForm({
      id: rate.id, service_category_id: rate.service_category_id, region: rate.region,
      complexity: rate.complexity, hourly_rate_zar: String(rate.hourly_rate_zar),
      callout_fee_zar: String(rate.callout_fee_zar), travel_fee_zar: String(rate.travel_fee_zar),
      emergency_multiplier: String(rate.emergency_multiplier), version: rate.version,
      illustrative: rate.illustrative
    });
    setError(""); setNotice("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const supabase = createClient();
    const { data, error: saveError } = await supabase.rpc("admin_save_fairprice_rate", {
      p_id: form.id || null,
      p_service_category_id: form.service_category_id,
      p_region: form.region,
      p_complexity: form.complexity,
      p_hourly_rate_zar: Number(form.hourly_rate_zar),
      p_callout_fee_zar: Number(form.callout_fee_zar),
      p_travel_fee_zar: Number(form.travel_fee_zar),
      p_emergency_multiplier: Number(form.emergency_multiplier),
      p_version: form.version,
      p_illustrative: form.illustrative
    });
    setBusy(false);
    if (saveError) { setError(saveError.message); return; }
    setForm(blank); setNotice("Rate saved as inactive. Review it before activation.");
    const { data: refreshed, error: refreshError } = await supabase.rpc("admin_list_fairprice_catalogue");
    if (refreshError) setError(refreshError.message);
    else setRates((refreshed ?? []) as Rate[]);
    router.refresh();
  }

  async function activate(rate: Rate) {
    if (busy) return;
    if (rate.illustrative) { setError("Illustrative entries must be edited and marked verified before activation."); return; }
    if (!window.confirm(`Activate this ${rate.service_name} rate for ${rate.region} (${rate.complexity})? This replaces any active matching entry.`)) return;
    setBusy(true); setError(""); setNotice("");
    const supabase = createClient();
    const { error: actionError } = await supabase.rpc("admin_set_fairprice_rate_active", { p_id: rate.id, p_active: !rate.active });
    setBusy(false);
    if (actionError) { setError(actionError.message); return; }
    const { data, error: refreshError } = await supabase.rpc("admin_list_fairprice_catalogue");
    if (refreshError) setError(refreshError.message);
    else setRates((data ?? []) as Rate[]);
    setNotice(rate.active ? "Rate deactivated." : "Verified rate activated.");
  }

  const money = (n: number) => "R" + Number(n).toLocaleString("en-ZA");
  return <section className="request-card">
    <div className="eyebrow">VERIFIED PRICING CONTROLS</div>
    <h2>FairPrice Catalogue</h2>
    <p>Configure service rates by region and complexity. New or edited entries are always saved inactive. Only verified entries can be activated.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="success-note" role="status">{notice}</p>}
    <form onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 18 }}>
      <div><label className="field-label" htmlFor="fp-service">Service category</label><select id="fp-service" className="form-input" required value={form.service_category_id} onChange={e=>update("service_category_id",e.target.value)}><option value="">Select service</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className="field-label" htmlFor="fp-region">Region</label><input id="fp-region" className="form-input" required maxLength={100} value={form.region} onChange={e=>update("region",e.target.value)}/></div>
      <div><label className="field-label" htmlFor="fp-complexity">Complexity</label><select id="fp-complexity" className="form-input" value={form.complexity} onChange={e=>update("complexity",e.target.value)}><option value="simple">Simple</option><option value="standard">Standard</option><option value="complex">Complex</option></select></div>
      <div><label className="field-label" htmlFor="fp-hourly">Hourly rate (ZAR)</label><input id="fp-hourly" className="form-input" type="number" min="1" step="1" required value={form.hourly_rate_zar} onChange={e=>update("hourly_rate_zar",e.target.value)}/></div>
      <div><label className="field-label" htmlFor="fp-callout">Call-out fee (ZAR)</label><input id="fp-callout" className="form-input" type="number" min="0" step="1" required value={form.callout_fee_zar} onChange={e=>update("callout_fee_zar",e.target.value)}/></div>
      <div><label className="field-label" htmlFor="fp-travel">Travel fee (ZAR)</label><input id="fp-travel" className="form-input" type="number" min="0" step="1" required value={form.travel_fee_zar} onChange={e=>update("travel_fee_zar",e.target.value)}/></div>
      <div><label className="field-label" htmlFor="fp-emergency">Emergency multiplier</label><input id="fp-emergency" className="form-input" type="number" min="1" max="5" step="0.05" required value={form.emergency_multiplier} onChange={e=>update("emergency_multiplier",e.target.value)}/></div>
      <div><label className="field-label" htmlFor="fp-version">Catalogue version</label><input id="fp-version" className="form-input" required maxLength={40} value={form.version} onChange={e=>update("version",e.target.value)}/></div>
      <label style={{display:"flex",gap:9,alignItems:"center",gridColumn:"1/-1"}}><input type="checkbox" checked={form.illustrative} onChange={e=>update("illustrative",e.target.checked)}/> Illustrative / not yet verified (cannot be activated)</label>
      <div className="button-row" style={{gridColumn:"1/-1"}}>
        <button className="btn btn-orange" type="submit" disabled={busy || categories.length===0}>{busy ? "Saving..." : editing ? "Save changes" : "Add catalogue rate"}</button>
        {editing && <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={()=>setForm(blank)}>Cancel edit</button>}
      </div>
    </form>
    <div style={{display:"grid",gap:12,marginTop:22}}>
      {rates.map(rate=><article key={rate.id} style={{border:"1px solid #e1eaf4",borderRadius:12,padding:15}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div><b>{rate.service_name}</b><div className="form-hint">{rate.region} · {rate.complexity} · {rate.version}</div></div>
          <div><b>{rate.active ? "ACTIVE" : "INACTIVE"}</b><div className="form-hint">{rate.illustrative ? "Illustrative / unverified" : "Marked verified"}</div></div>
        </div>
        <p className="form-hint">{money(rate.hourly_rate_zar)}/hour · Call-out {money(rate.callout_fee_zar)} · Travel {money(rate.travel_fee_zar)} · Emergency ×{rate.emergency_multiplier}</p>
        <div className="button-row"><button type="button" className="btn btn-outline-dark" disabled={busy} onClick={()=>edit(rate)}>Edit</button><button type="button" className="btn btn-orange" disabled={busy || (rate.illustrative && !rate.active)} onClick={()=>activate(rate)}>{rate.active ? "Deactivate" : "Activate"}</button></div>
      </article>)}
      {rates.length===0 && <p className="form-hint">No FairPrice catalogue entries yet. Add a rate above.</p>}
    </div>
  </section>;
}
