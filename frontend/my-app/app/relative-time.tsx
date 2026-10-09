"use client";

import { useEffect, useState } from "react";
import { formatBlockAge, formatRelativeBlockTime } from "@/app/lib/explorer";

type RelativeTimeProps = {
  timestamp: number;
  variant?: "short" | "long";
};

export default function RelativeTime({ timestamp, variant = "short" }: RelativeTimeProps) {
  const [label, setLabel] = useState(() =>
    variant === "long"
      ? formatBlockAge(timestamp)
      : formatRelativeBlockTime(timestamp),
  );

  useEffect(() => {
    const update = () =>
      setLabel(
        variant === "long"
          ? formatBlockAge(timestamp)
          : formatRelativeBlockTime(timestamp),
      );
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [timestamp, variant]);

  return <>{label}</>;
}
