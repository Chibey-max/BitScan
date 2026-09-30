import Link from "next/link";
import { API_BASE } from "@/app/lib/explorer";
import SmartSearch from "@/app/smart-search";
import ThemeToggle from "@/app/theme-toggle";

export default function SiteHeader({ live = true }: { live?: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="BitScan home">
          <span className="word-logo" aria-hidden="true">
            <span className="word-logo-line" />
            <span className="word-logo-name">
              <span>Bit</span><span>Scan</span>
            </span>
            {/* <span className="word-logo-tag">BLOCK EXPLORER</span> */}
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/#latest-blocks">Blocks</Link>
          <a href={`${API_BASE}/health`} target="_blank" rel="noreferrer">API</a>
        </nav>
        <SmartSearch />
        <div className="header-status"><span className={live ? "status-dot" : "status-dot status-dot-offline"} /><span>{live ? "Live" : "Demo"}</span></div>
        <ThemeToggle />
        <span className="network-pill">Mainnet</span>
      </div>
    </header>
  );
}
