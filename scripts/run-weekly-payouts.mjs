const stagingOrigin = process.env.WEEKLY_PAYOUT_STAGING_ORIGIN;
const token = process.env.WEEKLY_PAYOUT_CRON_TOKEN;

if (!stagingOrigin || !token) {
  console.error("Set WEEKLY_PAYOUT_STAGING_ORIGIN and WEEKLY_PAYOUT_CRON_TOKEN.");
  process.exit(1);
}

try {
  const url = new URL("/api/internal/weekly-payouts", stagingOrigin);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Weekly payout staging origin must be an HTTPS origin.");
  }

  const result = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(600_000)
  });
  const summary = await result.json().catch(() => null);
  console.log("Weekly payout run", {
    status: result.status,
    processed: summary?.processed,
    errors: summary?.errors
  });
  if (!result.ok) process.exitCode = 1;
} catch {
  console.error("Weekly payout endpoint could not be reached.");
  process.exitCode = 1;
}
