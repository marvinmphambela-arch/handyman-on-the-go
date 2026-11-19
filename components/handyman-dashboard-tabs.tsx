"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

const tabs = [
  { id: "home", label: "Home" },
  { id: "bookings", label: "Bookings" },
  { id: "cancellations", label: "Cancellations" },
  { id: "earnings", label: "Earnings" },
  { id: "profile", label: "Profile" },
] as const;

type TabId = typeof tabs[number]["id"];

export default function HandymanDashboardTabs({ home, bookings, cancellations, earnings, profile }: {
  home: ReactNode; bookings: ReactNode; cancellations: ReactNode; earnings: ReactNode; profile: ReactNode;
}) {
  const searchParams = useSearchParams();
  const [active, setActive] = useState<TabId>("home");

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "earnings" || section === "bookings") setActive(section);
  }, [searchParams]);

  useEffect(() => {
    if (active !== "bookings") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#booking-")) return;
    const targetId = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(targetId);
    if (!target) return;
    target.closest("details")?.setAttribute("open", "");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [active]);

  const panels: Record<TabId, ReactNode> = { home, bookings, cancellations, earnings, profile };
  return <>
    <nav className="handyman-dashboard-nav" aria-label="Dashboard sections">
      {tabs.map(tab => <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} aria-current={active === tab.id ? "page" : undefined} onClick={() => { setActive(tab.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{tab.label}</button>)}
    </nav>
    <section className="handyman-dashboard-panel">{panels[active]}</section>
  </>;
}
