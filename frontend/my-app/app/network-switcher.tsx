"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NetworkKey, networkLabel } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";

export default function NetworkSwitcher({ network }: { network: NetworkKey }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEntityDetail =
    pathname.startsWith("/block/") ||
    pathname.startsWith("/tx/") ||
    pathname.startsWith("/address/") ||
    pathname.startsWith("/addr/");

  function hrefFor(nextNetwork: NetworkKey) {
    if (nextNetwork !== network && isEntityDetail) {
      return nextNetwork === "testnet" ? "/?network=testnet" : "/";
    }

    const params = new URLSearchParams(searchParams.toString());
    if (nextNetwork === "testnet") {
      params.set("network", "testnet");
    } else {
      params.delete("network");
    }
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  return (
    <details className="network-menu">
      <summary className="network-pill network-trigger">
        <span className="network-trigger-dot" />
        {networkLabel(network)}
        <MaterialIcon name="expand_more" />
      </summary>
      <div className="network-menu-panel">
        {(["mainnet", "testnet"] as NetworkKey[]).map((item) => (
          <Link
            key={item}
            href={hrefFor(item)}
            className={item === network ? "network-option network-option-active" : "network-option"}
          >
            <span>
              <strong>{networkLabel(item)}</strong>
              <small>{item === "mainnet" ? "BitRPC Bitcoin mainnet" : "Tatum Bitcoin testnet"}</small>
            </span>
            {item === network ? <MaterialIcon name="check" /> : null}
          </Link>
        ))}
      </div>
    </details>
  );
}
