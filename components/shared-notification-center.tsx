"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  recipient_role: "customer" | "handyman";
  job_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

const styles: Record<string, { icon: string; tone: string }> = {
  handyman_offer_received: { icon: "💬", tone: "offer" },
  offer_accepted: { icon: "🎉", tone: "success" },
  offer_not_selected: { icon: "↗", tone: "muted" },
  handyman_en_route: { icon: "🚗", tone: "travel" },
  work_started: { icon: "🛠️", tone: "work" },
  job_completed: { icon: "✓", tone: "success" },
  booking_cancelled: { icon: "⚠️", tone: "warning" },
};

function timeLabel(value: string) {
  return new Date(value).toLocaleString("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SharedNotificationCenter({ role }: { role: "customer" | "handyman" }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const loadNotifications = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("notifications")
      .select("id, recipient_role, job_id, notification_type, title, message, read_at, created_at")
      .eq("recipient_role", role)
      .order("created_at", { ascending: false })
      .limit(30);

    if (queryError) {
      setError("Notifications could not be loaded. Please refresh the page.");
    } else {
      setError("");
      setItems((data ?? []) as NotificationRow[]);
    }
    setLoading(false);
  }, [role, supabase]);

  useEffect(() => {
    let active = true;
    void loadNotifications();

    const channel = supabase
      .channel(`shared-notifications-${role}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
      }, (payload) => {
        if (!active) return;
        void loadNotifications();
        if (
          role === "customer" &&
          payload.eventType === "INSERT" &&
          payload.new.recipient_role === "customer" &&
          payload.new.notification_type === "handyman_offer_received"
        ) {
          router.refresh();
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [loadNotifications, role, router, supabase]);

  const unreadCount = items.filter(item => !item.read_at).length;

  async function markAsRead(id: string) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .is("read_at", null);

    if (updateError) {
      setError("We couldn't mark that notification as read. Please try again.");
      return;
    }
    setItems(current => current.map(item => item.id === id ? { ...item, read_at: now } : item));
  }

  async function markAllAsRead() {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null);

    if (updateError) {
      setError("We couldn't mark notifications as read. Please try again.");
      return;
    }
    setItems(current => current.map(item => item.read_at ? item : { ...item, read_at: now }));
  }

  return (
    <section className="shared-notifications" aria-label="Notifications">
      <button
        className="shared-notifications-heading"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
      >
        <span className="shared-notifications-heading-icon" aria-hidden="true">🔔</span>
        <span className="shared-notifications-heading-copy">
          <strong>Notifications</strong>
          <small>{unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}</small>
        </span>
        {unreadCount > 0 && <span className="shared-notifications-count" aria-label={`${unreadCount} unread`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
        <span className="shared-notifications-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="shared-notifications-body">
          <div className="shared-notifications-toolbar">
            <span>Recent updates</span>
            {unreadCount > 0 && <button type="button" onClick={markAllAsRead}>Mark all as read</button>}
          </div>
          {error && <p className="shared-notifications-error" role="alert">{error}</p>}
          {loading ? <p className="shared-notifications-empty">Loading your notifications…</p> :
            items.length === 0 ? <p className="shared-notifications-empty">Important offer and booking updates will appear here.</p> :
              <div className="shared-notifications-list">
                {items.map(item => {
                  const style = styles[item.notification_type] ?? { icon: "🔔", tone: "muted" };
                  const href = item.job_id
                    ? role === "customer" ? `/account#job-${item.job_id}` : `/handyman#booking-${item.job_id}`
                    : role === "customer" ? "/account" : "/handyman";
                  return (
                    <article className={`shared-notification-item ${item.read_at ? "is-read" : "is-unread"}`} key={item.id}>
                      <span className={`shared-notification-icon tone-${style.tone}`} aria-hidden="true">{style.icon}</span>
                      <div className="shared-notification-copy">
                        <div className="shared-notification-title-row">
                          <strong>{item.title}</strong>
                          {!item.read_at && <span className="shared-notification-unread-dot" aria-label="Unread" />}
                        </div>
                        <p>{item.message}</p>
                        <small>{timeLabel(item.created_at)}</small>
                        <div className="shared-notification-actions">
                          <Link href={href} onClick={() => { if (item.job_id) { const target = document.getElementById(`${role === "customer" ? "job" : "booking"}-${item.job_id}`); target?.closest("details")?.setAttribute("open", ""); } if (!item.read_at) void markAsRead(item.id); }}>View booking</Link>
                          {!item.read_at && <button type="button" onClick={() => void markAsRead(item.id)}>Mark as read</button>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>}
        </div>
      )}
    </section>
  );
}
