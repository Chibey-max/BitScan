"use client";

import { useEffect, useRef, useState } from "react";
import { NetworkKey } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";

export default function SmartSearch({ network = "mainnet" }: { network?: NetworkKey }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tagName = target.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target.isContentEditable
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "/" && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <form
      action="/search"
      method="get"
      className="smart-search"
    >
      <MaterialIcon name="search" />
      <label className="sr-only" htmlFor="header-search">
        Search by block height, block hash, transaction id, or address
      </label>
      <input
        ref={inputRef}
        id="header-search"
        name="q"
        placeholder="Search height, hash, txid, or address"
        autoComplete="off"
        aria-keyshortcuts="/"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {network === "testnet" ? (
        <input type="hidden" name="network" value="testnet" />
      ) : null}
      <kbd>/</kbd>
    </form>
  );
}
