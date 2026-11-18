"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ServiceReceiptActions() {
  useEffect(() => {
    // Keep printing user-initiated so the customer can review the receipt first.
  }, []);
  return <div className="receipt-actions">
    <button type="button" className="btn btn-orange" onClick={() => window.print()}>Download / Print receipt</button>
    <Link href="/account" className="text-link">Back to my jobs</Link>
  </div>;
}
