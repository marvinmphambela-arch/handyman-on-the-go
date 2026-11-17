"use client";

import { useEffect, useState, type ReactNode } from "react";

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
  const [active, setActive] = useState<TabId>("home");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("section") === "earnings") setActive("earnings");
  }, []);
  const panels: Record<TabId, ReactNode> = { home, bookings, cancellations, earnings, profile };
  return <>
    <nav className="handyman-dashboard-nav" aria-label="Dashboard sections">
      {tabs.map(tab => <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} aria-current={active === tab.id ? "page" : undefined} onClick={() => { setActive(tab.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{tab.label}</button>)}
    </nav>
    <section className="handyman-dashboard-panel">{panels[active]}</section>
  </>;
}
