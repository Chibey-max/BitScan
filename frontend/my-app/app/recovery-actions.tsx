"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/app/material-icon";

export function AutoRetryRefresh({
  reason,
  delayMs = 4_000,
  maxAttempts = 3,
  showNotice = false,
}: {
  reason: string;
  delayMs?: number;
  maxAttempts?: number;
  showNotice?: boolean;
}) {
  const router = useRouter();
  const storageNamespace = useMemo(() => `bitscan:auto-retry:${reason}`, [reason]);

  useEffect(() => {
    const storageKey = `${storageNamespace}:${window.location.pathname}${window.location.search}`;
    const currentAttempt = Number(window.sessionStorage.getItem(storageKey) ?? "0");
    if (currentAttempt >= maxAttempts) return;

    const nextAttempt = currentAttempt + 1;
    window.sessionStorage.setItem(storageKey, String(nextAttempt));

    const timeout = window.setTimeout(() => {
      console.info("[bitscan-recovery] refreshing route after fallback", {
        reason,
        attempt: nextAttempt,
        maxAttempts,
      });
      router.refresh();
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [delayMs, maxAttempts, reason, router, storageNamespace]);

  if (!showNotice) return null;

  return (
    <div className="recovery-banner" role="status">
      <MaterialIcon name="sync" />
      <span>Reconnecting to live Bitcoin data...</span>
    </div>
  );
}

export function RetryNowButton({ label = "Retry data" }: { label?: string }) {
  const router = useRouter();

  return (
    <button type="button" className="outline-button" onClick={() => router.refresh()}>
      <MaterialIcon name="refresh" />
      {label}
    </button>
  );
}
