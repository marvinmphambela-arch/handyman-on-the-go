"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("handyman-on-the-go-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "job_offers" }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
