"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AdminJob = {
  job_id: string;
  title: string | null;
  description: string | null;
  service_category: string | null;
  job_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  handyman_name: string | null;
  handyman_phone: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  created_at: string;
  accepted_offer_amount_zar: number | null;
  offer_count: number;
  payment_status: string | null;
  paid_amount_zar: number | null;
};

const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["open", "Open"],
  ["offer_selected", "Offer selected"],
  ["confirmed", "Confirmed"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
  ["disputed", "Disputed"]
];

function money(value: number | null | undefined) {
  if (value == null) return "—";
  return "R" + Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JobsBookingsManagement() {
  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AdminJob[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadJobs = useCallback(async (nextOffset: number, nextSearch: string, nextStatus: string) => {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error: searchError } = await supabase.rpc("admin_search_jobs_bookings", {
      p_search: nextSearch || null,
      p_status: nextStatus || null,
      p_limit: PAGE_SIZE,
      p_offset: nextOffset
    });
    if (searchError) {
      setRows([]);
      setHasMore(false);
      setError(searchError.message);
    } else {
      const results = (data ?? []) as AdminJob[];
      setRows(results);
      setHasMore(results.length === PAGE_SIZE);
    }
    setOffset(nextOffset);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadJobs(0, "", "");
  }, [loadJobs]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    setStatus(statusInput);
    void loadJobs(0, nextSearch, statusInput);
  }

  function changePage(nextOffset: number) {
    void loadJobs(nextOffset, search, status);
  }

  return <section className="request-card">
    <div className="eyebrow">MARKETPLACE MANAGEMENT</div>
    <h2>Jobs &amp; bookings</h2>
    <p>Search and inspect jobs, accepted handymen, offers, and payment records. This section is read-only; it does not change bookings or payments.</p>

    <form onSubmit={applyFilters} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) minmax(160px, 1fr) auto", gap: 12, alignItems: "end", marginTop: 18 }}>
      <div>
        <label className="field-label" htmlFor="admin-job-search">Search jobs</label>
        <input id="admin-job-search" className="form-input" type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Job title, customer, handyman, phone or job ID" />
      </div>
      <div>
        <label className="field-label" htmlFor="admin-job-status">Filter by status</label>
        <select id="admin-job-status" className="form-input" value={statusInput} onChange={event => setStatusInput(event.target.value)}>
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <button className="btn btn-orange" type="submit" disabled={loading}>Search</button>
    </form>

    {error && <p className="form-error" role="alert" style={{ marginTop: 16 }}>Jobs and bookings could not be loaded: {error}</p>}
    {loading && <p className="form-hint" style={{ marginTop: 16 }}>Loading jobs and bookings...</p>}
    {!loading && !error && <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
      <p className="form-hint">Showing {rows.length ? offset + 1 : 0}–{offset + rows.length}. Search results are limited to 50 per page.</p>
      {rows.map(job => <article key={job.job_id} style={{ border: "1px solid #e7e7e7", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="eyebrow">{(job.job_status || "unknown").replaceAll("_", " ")}</div>
            <h3 style={{ margin: "5px 0" }}>{job.title || "Untitled job"}</h3>
            <p className="form-hint" style={{ margin: 0 }}>Job ID: {job.job_id}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="eyebrow">ACCEPTED OFFER</div>
            <strong>{money(job.accepted_offer_amount_zar)}</strong>
          </div>
        </div>
        {job.description && <p style={{ marginTop: 12 }}>{job.description}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginTop: 12 }}>
          <div><div className="eyebrow">CUSTOMER</div><div>{job.customer_name || "Not available"}</div><div className="form-hint">{job.customer_phone || "No phone"}</div></div>
          <div><div className="eyebrow">HANDYMAN</div><div>{job.handyman_name || "Not assigned"}</div><div className="form-hint">{job.handyman_phone || "No phone"}</div></div>
          <div><div className="eyebrow">SERVICE &amp; LOCATION</div><div>{job.service_category || "Uncategorised"}</div><div className="form-hint">{[job.suburb, job.city, job.province].filter(Boolean).join(", ") || "Location not available"}</div></div>
          <div><div className="eyebrow">OFFERS &amp; PAYMENT</div><div>{job.offer_count ?? 0} offer(s)</div><div className="form-hint">Payment: {job.payment_status || "No payment record"}</div><div className="form-hint">Paid: {money(job.paid_amount_zar)}</div></div>
        </div>
        <p className="form-hint" style={{ marginBottom: 0 }}>Posted {new Date(job.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>
      </article>)}
      {rows.length === 0 && <p className="form-hint">No jobs or bookings match these search criteria.</p>}
      <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="btn btn-outline-dark" disabled={offset === 0 || loading} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
        <span className="form-hint">Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
        <button type="button" className="btn btn-outline-dark" disabled={!hasMore || loading} onClick={() => changePage(offset + PAGE_SIZE)}>Next</button>
      </div>
    </div>}
  </section>;
}
