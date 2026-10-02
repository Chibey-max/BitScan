"use client";

import type React from "react";
import { useState } from "react";

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

  async function copyValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
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
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

function CopyIcon() {
  return (
    <svg
      className="copy-button-icon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 7.5C8 6.67157 8.67157 6 9.5 6H18.5C19.3284 6 20 6.67157 20 7.5V18.5C20 19.3284 19.3284 20 18.5 20H9.5C8.67157 20 8 19.3284 8 18.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M5 16.5V5.5C5 4.67157 5.67157 4 6.5 4H15.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="copy-button-icon copy-button-icon-check"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 12.5L9.5 17L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
