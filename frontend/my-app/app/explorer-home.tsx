import Link from "next/link";
import CopyButton from "@/app/copy-button";
import {
  BlockSummary,
  Mempool,
  Tip,
  blockFullnessPercent,
  compactHash,
  formatBytes,
  formatRelativeBlockTime,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

type ExplorerHomeProps = {
  state: "live" | "demo";
  tip: Tip;
  mempool: Mempool;
  blocks: BlockSummary[];
  fromHeight?: number;
  nextFromHeight?: number;
};

export default function ExplorerHome({
  state,
  tip,
  mempool,
  blocks,
  fromHeight,
  nextFromHeight,
}: ExplorerHomeProps) {
  const subsidy = 50 / 2 ** Math.floor(tip.height / 210_000);
  const minRelayFee = mempool.min_fee_rate ? mempool.min_fee_rate * 100_000 : undefined;
  const currentStart = blocks[0]?.height ?? fromHeight ?? tip.height;
  const newerFromHeight =
    fromHeight === undefined ? undefined : Math.min(tip.height, fromHeight + blocks.length);
  const latestBlock = blocks[0];
  const latestFullness = blockFullnessPercent(latestBlock?.weight);

  return (
    <main className="app-shell">
      <SiteHeader live={state === "live"} />
      <div className="dashboard-wrap explorer-stage">
        <section className="command-deck reveal-panel">
          <div className="command-copy">
            <div className="live-badge">
              <span className={state === "live" ? "status-dot" : "status-dot status-dot-offline"} />
              {state === "live" ? "Mainnet live" : "Demo data"}
            </div>
            <h1>BitScan Bitcoin Explorer</h1>
            <p>
              Inspect blocks and transactions from a Rust API backed by Bitcoin Core RPC.
              Paste a height, block hash, transaction id, or address to start.
            </p>
          </div>
          <div className="command-proof">
            <MaterialIcon name="crowdsource" />
            <p>Data source: bitrpc.thebuidl.xyz.</p>
            <div className="search-examples" aria-label="Search examples">
              <Link href={`/block/${tip.height}`}>#{tip.height.toLocaleString("en-US")}</Link>
              <Link href={`/block/${tip.hash}`}>{compactHash(tip.hash, 8, 6)}</Link>
              <span>{state === "live" ? "RPC connected" : "Provider fallback"}</span>
            </div>
          </div>
        </section>

        <section className="chain-hero reveal-panel reveal-delay-1">
          <div className="tip-card">
            <div className="tip-grid">
              <div>
                <p className="section-kicker">Current chain tip</p>
                <Link href={`/block/${tip.height}`} className="tip-height">
                  {tip.height.toLocaleString("en-US")}
                  <MaterialIcon name="arrow_forward" />
                </Link>
                <div className="tip-hash hash-line">
                  <p className="mono">{tip.hash}</p>
                  <CopyButton value={tip.hash} label="Copy block hash" compact />
                </div>
              </div>
              <div className="tip-orbit" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
            <div className="tip-meta">
              <MetricMini label="Verification" value={`${((tip.verification_progress ?? 0) * 100).toFixed(2)}%`} />
              <MetricMini label="Subsidy" value={`${subsidy.toFixed(3)} BTC`} />
              <MetricMini label="Source" value="BitRPC" />
            </div>
            {latestBlock ? (
              <div className="tip-utilization">
                <div>
                  <p className="section-kicker">Latest block utilization</p>
                  <strong>{latestFullness === undefined ? "pending" : `${latestFullness.toFixed(1)}% full`}</strong>
                  <span>
                    {latestBlock.tx_count.toLocaleString("en-US")} txs .{" "}
                    {formatBytes(latestBlock.weight)} WU . mined {formatRelativeBlockTime(latestBlock.timestamp)}
                  </span>
                </div>
                <BlockFillBar percent={latestFullness} large />
              </div>
            ) : null}
          </div>

          <div className="network-stack">
            <MetricCard
              icon="database"
              label="Mempool"
              value={mempool.size.toLocaleString("en-US")}
              suffix="txs"
              detail={`${(mempool.bytes / 1_000_000).toFixed(2)} MB waiting`}
              tone="green"
            />
            <MetricCard
              icon="speed"
              label="Min relay fee"
              value={minRelayFee?.toFixed(2) ?? "n/a"}
              suffix="sat/vB"
              detail="mempoolminfee"
            />
            <MetricCard
              icon="currency_bitcoin"
              label="Block subsidy"
              value={subsidy.toFixed(3)}
              suffix="BTC"
              detail={`Era ${Math.floor(tip.height / 210_000) + 1} reward`}
            />
          </div>
        </section>

        <div className="dashboard-grid premium-grid reveal-panel reveal-delay-2">
          <section id="latest-blocks" className="panel blocks-panel block-stream">
            <div className="panel-heading">
              <div>
                <h2>Latest blocks</h2>
                <span>
                  Showing from height {currentStart.toLocaleString("en-US")}
                </span>
              </div>
              <div className="pagination-actions">
                {newerFromHeight !== undefined && fromHeight !== undefined && newerFromHeight < tip.height ? (
                  <Link href={`/?from_height=${newerFromHeight}`} className="icon-button" aria-label="Newer blocks" title="Newer blocks">
                    <MaterialIcon name="arrow_back" />
                  </Link>
                ) : fromHeight !== undefined ? (
                  <Link href="/" className="outline-button">Latest</Link>
                ) : null}
                {nextFromHeight !== undefined ? (
                  <Link href={`/?from_height=${nextFromHeight}`} className="outline-button">
                    Older <MaterialIcon name="arrow_forward" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="block-timeline">
              {blocks.map((block, index) => (
                <BlockRow
                  key={block.hash}
                  block={block}
                  newest={index === 0 && fromHeight === undefined}
                />
              ))}
            </div>

            <div className="panel-footer">
              <span>{blocks.length} blocks on this page</span>
              <span className="mono">height cursor {nextFromHeight ?? "end"}</span>
            </div>
          </section>

          <aside className="dashboard-aside explorer-side">
            <section className="panel api-panel">
              <div className="aside-title">
                <MaterialIcon name="settings_input_antenna" />
                <h2>Runtime</h2>
              </div>
              <p>Requests resolved by the Rust backend for this page.</p>
              <Endpoint path="/api/tip" ok={state === "live"} note="current chain height" />
              <Endpoint path="/api/mempool" ok={state === "live"} note="mempool snapshot" />
              <Endpoint path="/api/blocks" ok={state === "live"} note="height-based pagination" />
            </section>

            <section className="panel coverage-panel">
              <div className="aside-title">
                <MaterialIcon name="hub" />
                <h2>Coverage</h2>
              </div>
              <Coverage icon="deployed_code" label="Block details" value="Ready" />
              <Coverage icon="receipt_long" label="Transaction details" value="Ready" />
              <Coverage icon="account_balance_wallet" label="Address history" value="Provider limited" warning />
            </section>

            {latestBlock ? (
              <section className="panel api-panel last-block-panel">
                <div className="aside-title">
                  <MaterialIcon name="schedule" />
                  <h2>Latest mined</h2>
                </div>
                <p className="mono">{compactHash(latestBlock.hash, 12, 10)}</p>
                <div className="last-block-stats">
                  <MetricMini label="Mined" value={formatRelativeBlockTime(latestBlock.timestamp)} />
                  <MetricMini label="Txs" value={latestBlock.tx_count.toLocaleString("en-US")} />
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
      <footer className="site-footer">
        <span>Rust . Axum . Bitcoin Core RPC</span>
        <span>BitScan explorer</span>
      </footer>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix,
  detail,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  tone?: "green";
}) {
  return (
    <section className={`metric-card premium-metric ${tone === "green" ? "metric-green" : ""}`}>
      <div className="metric-icon"><MaterialIcon name={icon} /></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">
        {value} {suffix ? <small>{suffix}</small> : null}
      </p>
      <p className="metric-detail">{detail}</p>
    </section>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BlockRow({ block, newest }: { block: BlockSummary; newest: boolean }) {
  const fullness = blockFullnessPercent(block.weight);

  return (
    <Link href={`/block/${block.height}`} className="block-row block-stream-row">
      <span className="block-node" aria-hidden="true">
        <MaterialIcon name="deployed_code" />
      </span>
      <span className="block-height" data-label="Height">
        {block.height.toLocaleString("en-US")}
        {newest ? <small>NEW</small> : null}
      </span>
      <span className="mono" data-label="Hash">{compactHash(block.hash, 12, 8)}</span>
      <span data-label="Mined">{formatRelativeBlockTime(block.timestamp)}</span>
      <span className="number" data-label="Txs">{block.tx_count.toLocaleString("en-US")}</span>
      <span className="block-fill-cell" data-label="Full">
        <BlockFillBar percent={fullness} compact />
      </span>
      <span className="row-arrow"><MaterialIcon name="arrow_forward" /></span>
    </Link>
  );
}

function BlockFillBar({
  percent,
  compact = false,
  large = false,
}: {
  percent?: number;
  compact?: boolean;
  large?: boolean;
}) {
  const safePercent = percent ?? 0;
  const className = [
    "block-fill",
    compact ? "block-fill-compact" : "",
    large ? "block-fill-large" : "",
  ].filter(Boolean).join(" ");

  return (
    <span className={className}>
      <span className="block-fill-track">
        <span style={{ width: `${safePercent}%` }} />
      </span>
      <span className="block-fill-label">
        {percent === undefined ? "pending" : `${percent.toFixed(compact ? 0 : 1)}%`}
      </span>
    </span>
  );
}

function Endpoint({ path, ok, note }: { path: string; ok: boolean; note: string }) {
  return (
    <div className="endpoint">
      <div>
        <code><span>GET</span> {path}</code>
        <strong className={ok ? "ok" : "bad"}>{ok ? "200" : "DEMO"}</strong>
      </div>
      <p>{note}</p>
    </div>
  );
}

function Coverage({
  icon,
  label,
  value,
  warning = false,
}: {
  icon: string;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="coverage-row">
      <span className="coverage-icon"><MaterialIcon name={icon} /></span>
      <span>{label}</span>
      <strong className={warning ? "warning" : "ready"}>
        <MaterialIcon name={warning ? "warning" : "check_circle"} />
        {value}
      </strong>
    </div>
  );
}
