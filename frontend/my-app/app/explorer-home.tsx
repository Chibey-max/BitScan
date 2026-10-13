import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import CopyButton from "@/app/copy-button";
import {
  BlockSummary,
  Mempool,
  NetworkKey,
  Tip,
  blockFullnessPercent,
  coinUnit,
  compactHash,
  formatBytes,
  formatFeeRate,
  networkHref,
  networkLabel,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import RelativeTime from "@/app/relative-time";
import { AutoRetryRefresh } from "@/app/recovery-actions";
import SiteHeader from "@/app/site-header";

type ExplorerHomeProps = {
  state: "live" | "demo";
  tip: Tip;
  mempool: Mempool;
  blocks: BlockSummary[];
  fromHeight?: number;
  nextFromHeight?: number;
  network: NetworkKey;
};

export default function ExplorerHome({
  state,
  tip,
  mempool,
  blocks,
  fromHeight,
  nextFromHeight,
  network,
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
      <SiteHeader live={state === "live"} network={network} />
      {state === "demo" ? (
        <AutoRetryRefresh reason={`demo:${network}`} showNotice />
      ) : null}
      <div className="dashboard-wrap explorer-stage">
        <section className="chain-hero reveal-panel reveal-delay-1">
          <div className="tip-card">
            <div className="tip-grid">
              <div>
                <p className="section-kicker">Current chain tip</p>
                <Link href={networkHref(`/block/${tip.height}`, network)} className="tip-height">
                  {tip.height.toLocaleString("en-US")}
                  <MaterialIcon name="arrow_forward" />
                </Link>
                <div className="tip-hash hash-line">
                  <Link href={networkHref(`/block/${tip.hash}`, network)} className="entity-link mono">
                    {tip.hash}
                  </Link>
                  <CopyButton value={tip.hash} label="Copy block hash" compact />
                </div>
              </div>
              <div className="tip-bitcoin-mark" aria-hidden="true">
                <span className="tip-bitcoin-ring" />
                <span className="tip-bitcoin-halo" />
                <Image
                  src="/Bitcoin.svg"
                  alt=""
                  width={112}
                  height={112}
                  priority
                  className="tip-bitcoin-svg"
                />
              </div>
            </div>
            <div className="tip-meta">
              <MetricMini label="Verification" value={`${((tip.verification_progress ?? 0) * 100).toFixed(2)}%`} />
              <MetricMini label="Subsidy" value={`${subsidy.toFixed(3)} ${coinUnit(network)}`} />
              <MetricMini label="Network" value={networkLabel(network)} />
            </div>
            {latestBlock ? (
              <div className="tip-utilization">
                <div>
                  <p className="section-kicker">Latest block utilization</p>
                  <strong>{latestFullness === undefined ? "pending" : `${latestFullness.toFixed(1)}% full`}</strong>
                  <span>
                    {latestBlock.tx_count.toLocaleString("en-US")} txs .{" "}
                    {formatBytes(latestBlock.weight)} WU . mined <RelativeTime timestamp={latestBlock.timestamp} />
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
              detail={`${(mempool.bytes / 1_000_000).toFixed(2)} MB waiting . ${mempool.pressure ?? "normal"} pressure`}
              tone="green"
            />
            <MetricCard
              icon="speed"
              label="Min relay fee"
              value={formatFeeRate(mempool.fee_bands?.high_sat_vb ?? minRelayFee).replace(" sat/vB", "")}
              suffix="sat/vB"
              detail={`medium ${formatFeeRate(mempool.fee_bands?.medium_sat_vb)}`}
            />
            <MetricCard
              icon="currency_bitcoin"
              label="Block subsidy"
              value={subsidy.toFixed(3)}
              suffix={coinUnit(network)}
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
                  <Link href={networkHref(`/?from_height=${newerFromHeight}`, network)} className="icon-button" aria-label="Newer blocks" title="Newer blocks">
                    <MaterialIcon name="arrow_back" />
                  </Link>
                ) : fromHeight !== undefined ? (
                  <Link href={networkHref("/", network)} className="outline-button">Latest</Link>
                ) : null}
                {nextFromHeight !== undefined ? (
                  <Link href={networkHref(`/?from_height=${nextFromHeight}`, network)} className="outline-button">
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
                  network={network}
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
            <section className="panel coverage-panel">
              <div className="aside-title">
                <MaterialIcon name="hub" />
                <h2>Coverage</h2>
              </div>
              <Coverage icon="deployed_code" label="Block details" value="Ready" />
              <Coverage icon="receipt_long" label="Transaction flow" value="Ready" />
              <Coverage icon="account_balance_wallet" label="Address history" value="Provider limited" warning />
            </section>

            {latestBlock ? (
              <section className="panel api-panel last-block-panel">
                <div className="aside-title">
                  <MaterialIcon name="schedule" />
                  <h2>Latest mined</h2>
                </div>
                <Link href={networkHref(`/block/${latestBlock.hash}`, network)} className="entity-link mono">
                  {compactHash(latestBlock.hash, 12, 10)}
                </Link>
                <div className="last-block-stats">
                  <MetricMini label="Mined" value={<RelativeTime timestamp={latestBlock.timestamp} />} />
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

function MetricMini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BlockRow({ block, newest, network }: { block: BlockSummary; newest: boolean; network: NetworkKey }) {
  const fullness = blockFullnessPercent(block.weight);

  return (
    <Link href={networkHref(`/block/${block.height}`, network)} className="block-row block-stream-row">
      <span className="block-node" aria-hidden="true">
        <MaterialIcon name="deployed_code" />
      </span>
      <span className="block-height" data-label="Height">
        {block.height.toLocaleString("en-US")}
        {newest ? <small>NEW</small> : null}
      </span>
      <span className="mono" data-label="Hash">{compactHash(block.hash, 12, 8)}</span>
      <span data-label="Mined"><RelativeTime timestamp={block.timestamp} /></span>
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

