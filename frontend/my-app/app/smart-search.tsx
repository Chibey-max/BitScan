"use client";

import { useState } from "react";
import { classifyQuery } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";

export default function SmartSearch() {
  const [value, setValue] = useState("");
  const type = classifyQuery(value);

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
        id="header-search"
        name="q"
        placeholder="Search height, hash, txid, or address"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <span className="query-chip">{type}</span>
      <kbd>/</kbd>
    </form>
  );
}
