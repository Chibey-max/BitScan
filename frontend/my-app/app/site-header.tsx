import Link from "next/link";
import SmartSearch from "@/app/smart-search";
import ThemeToggle from "@/app/theme-toggle";

export default function SiteHeader({ live = true }: { live?: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label="BitScan home">
          <span className="brand-name">
            <span className="brand-name-bit">Bit</span>
            <span className="brand-name-scan">Scan</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/#latest-blocks">Blocks</Link>
        </nav>
        <SmartSearch />
        <div className="header-status"><span className={live ? "status-dot" : "status-dot status-dot-offline"} /><span>{live ? "Live" : "Demo"}</span></div>
        <ThemeToggle />
        <span className="network-pill">Mainnet</span>
      </div>
    </header>
  );
}
