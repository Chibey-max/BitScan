"use client";

import { useState } from "react";
import MaterialIcon from "@/app/material-icon";

type CopyButtonProps = {
  value: string;
  label?: string;
  compact?: boolean;
};

export default function CopyButton({
  value,
  label = "Copy",
  compact = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      className={compact ? "copy-button copy-button-compact" : "copy-button"}
      onClick={copyValue}
      aria-label={`${label} to clipboard`}
      title={copied ? "Copied" : label}
    >
      <MaterialIcon name={copied ? "check" : "content_copy"} />
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
