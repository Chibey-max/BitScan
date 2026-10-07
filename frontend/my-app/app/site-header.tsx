import Link from "next/link";
import { NetworkKey, networkHref, networkLabel } from "@/app/lib/explorer";
import SmartSearch from "@/app/smart-search";
import ThemeToggle from "@/app/theme-toggle";

export default function SiteHeader({
  live = true,
  network = "mainnet",
}: {
  live?: boolean;
  network?: NetworkKey;
}) {
  const otherNetwork = network === "mainnet" ? "testnet" : "mainnet";
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
          <Link href={networkHref("/mempool", network)}>Mempool</Link>
        </nav>
        <SmartSearch network={network} />
        <div className="header-status"><span className={live ? "status-dot" : "status-dot status-dot-offline"} /><span>{live ? "Live" : "Demo"}</span></div>
        <ThemeToggle />
        <Link
          href={networkHref("/", otherNetwork)}
          className="network-pill network-switch"
          title={`Switch to ${networkLabel(otherNetwork)}`}
        >
          {networkLabel(network)}
        </Link>
      </div>
    </header>
  );
}
