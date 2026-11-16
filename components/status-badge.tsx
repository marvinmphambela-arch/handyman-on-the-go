const styles: Record<string, string> = {
  open: "status-open",
  pending: "status-pending",
  confirmed: "status-confirmed",
  accepted: "status-confirmed",
  on_the_way: "status-en-route",
  in_progress: "status-progress",
  completed: "status-completed",
  cancelled: "status-cancelled",
  rejected: "status-rejected",
  declined: "status-rejected",
  approved: "status-approved",
  under_review: "status-pending",
  suspended: "status-cancelled",
  pending_verification: "status-pending"
};

export default function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  return <span className={`status-badge ${styles[status] ?? "status-neutral"}`}>{label}</span>;
}
