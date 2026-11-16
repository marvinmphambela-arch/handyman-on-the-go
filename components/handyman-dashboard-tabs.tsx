"use client";

import { useState, type ReactNode } from "react";

const tabs = [
  { id: "home", label: "Home" },
  { id: "jobs", label: "New Jobs" },
  { id: "bookings", label: "Bookings" },
  { id: "cancellations", label: "Cancellations" },
  { id: "earnings", label: "Earnings" },
  { id: "profile", label: "Profile" },
] as const;

type TabId = typeof tabs[number]["id"];

export default function HandymanDashboardTabs({ home, jobs, bookings, cancellations, earnings, profile }: {
  home: ReactNode; jobs: ReactNode; bookings: ReactNode; cancellations: ReactNode; earnings: ReactNode; profile: ReactNode;
}) {
  const [active, setActive] = useState<TabId>("home");
  const panels: Record<TabId, ReactNode> = { home, jobs, bookings, cancellations, earnings, profile };
  return <>
    <nav className="handyman-dashboard-nav" aria-label="Dashboard sections">
      {tabs.map(tab => <button key={tab.id} type="button" className={active === tab.id ? "active" : ""} aria-current={active === tab.id ? "page" : undefined} onClick={() => { setActive(tab.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{tab.label}</button>)}
    </nav>
    <section className="handyman-dashboard-panel">{panels[active]}</section>
  </>;
}
