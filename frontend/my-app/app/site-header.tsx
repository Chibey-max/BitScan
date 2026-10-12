import Link from "next/link";
import { Suspense } from "react";
import { NetworkKey, networkHref, networkLabel } from "@/app/lib/explorer";
import NetworkSwitcher from "@/app/network-switcher";
import SmartSearch from "@/app/smart-search";
import ThemeToggle from "@/app/theme-toggle";

export default function SiteHeader({
  live = true,
  network = "mainnet",
}: {
  live?: boolean;
  network?: NetworkKey;
}) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={networkHref("/", network)} className="brand" aria-label="BitScan home">
          <span className="brand-name">
            <span className="brand-name-bit">Bit</span>
            <span className="brand-name-scan">Scan</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href={networkHref("/#latest-blocks", network)}>Blocks</Link>
          <Link href={networkHref("/transactions", network)}>Transactions</Link>
          <Link href={networkHref("/mempool", network)}>Mempool</Link>
          <Link href={networkHref("/news", network)}>News</Link>
          <Link href={networkHref("/ai", network)}>AI</Link>
        </nav>
        <SmartSearch network={network} />
        <div className="header-status"><span className={live ? "status-dot" : "status-dot status-dot-offline"} /><span>{live ? "Live" : "Demo"}</span></div>
        <ThemeToggle />
        <Suspense fallback={<span className="network-pill">{networkLabel(network)}</span>}>
          <NetworkSwitcher network={network} />
        </Suspense>
      </div>
    </header>
  );
}
