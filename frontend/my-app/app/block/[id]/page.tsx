import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import CopyButton from "@/app/copy-button";
import ErrorState from "@/app/error-state";
import SiteHeader from "@/app/site-header";
import {
  BlockDetail,
  BlockTransactions,
  blockFullnessPercent,
  errorMessage,
  formatBtcFromSats,
  formatBlockInterval,
  formatBytes,
  formatFeeRate,
  formatNumber,
  formatTime,
  getJson,
  isNetworkUnavailable,
  networkHref,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import RelativeTime from "@/app/relative-time";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string; network?: string }>;
};

const TX_PAGE_SIZE = 12;
const CAPACITY_GRID_COLUMNS = 16;
const CAPACITY_GRID_ROWS = 16;
const CAPACITY_GRID_CELLS = CAPACITY_GRID_COLUMNS * CAPACITY_GRID_ROWS;

export default async function BlockPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { offset: offsetParam, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);
  const offset = offsetParam && /^\d+$/.test(offsetParam) ? Number(offsetParam) : 0;
  let block: BlockDetail;
  try {
    block = await getJson<BlockDetail>(withNetwork(`/api/block/${encodeURIComponent(id)}`, network));
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet is not connected yet"
          message="This deployment needs a testnet Bitcoin RPC endpoint before testnet blocks can be explored."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Block not available"
        message={errorMessage(
          error,
          "The provider could not return this block. Check the height/hash or try again shortly.",
        )}
        network={network}
      />
    );
  }

  let txs: BlockTransactions | undefined;
  let txsError: string | undefined;
  try {
    txs = await getJson<BlockTransactions>(
      withNetwork(
        `/api/block/${encodeURIComponent(id)}/txs?limit=${TX_PAGE_SIZE}&offset=${offset}`,
        network,
      ),
    );
  } catch (error) {
    txsError = errorMessage(
      error,
      "Transaction summaries are not available from the provider for this block.",
    );
  }
  const fallbackTxids = block.txids.slice(offset, offset + TX_PAGE_SIZE);
  const visibleTxCount = txs?.transactions.length ?? fallbackTxids.length;
  const totalTxCount = txs?.total ?? block.tx_count;
  const previousOffset = Math.max(0, offset - TX_PAGE_SIZE);
  const nextOffset = offset + visibleTxCount;
  const hasPrevious = offset > 0;
  const hasNext = offset + visibleTxCount < totalTxCount;
  const fullness = blockFullnessPercent(block.weight);

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link
            href={networkHref("/", network)}
            className="back-link"
          >
            <MaterialIcon name="chevron_left" />
            Explorer
          </Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="block-title-line">
                <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                  Block {block.height.toLocaleString("en-US")}
                </h1>
                <span className="block-age-chip">
                  <RelativeTime timestamp={block.timestamp} variant="long" />
                </span>
                <span className="flow-chip">{block.confirmations ? "confirmed" : "mempool"}</span>
              </div>
              <div className="hash-line">
                <Link href={networkHref(`/block/${block.hash}`, network)} className="entity-link mono">
                  {block.hash}
                </Link>
                <CopyButton value={block.hash} label="Copy hash" compact />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {block.previous_block_hash ? (
                <Link
                  href={networkHref(`/block/${block.height - 1}`, network)}
                  className="outline-button"
                >
                  <MaterialIcon name="arrow_back" />
                  Previous
                </Link>
              ) : null}
              {block.next_block_hash ? (
                <Link
                  href={networkHref(`/block/${block.height + 1}`, network)}
                  className="outline-button"
                >
                  Next
                  <MaterialIcon name="arrow_forward" />
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)] reveal-panel reveal-delay-1">
          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat
                icon="receipt_long"
                label="Transactions"
                value={block.tx_count.toLocaleString("en-US")}
              />
              <Stat
                icon="database"
                label="Size"
                value={formatBytes(block.size)}
                sub="bytes"
              />
              <Stat
                icon="schedule"
                label="Time since last block"
                value={formatBlockInterval(block.time_since_previous_block_seconds)}
                sub={block.previous_block_hash ? "from previous block" : "genesis block"}
              />
              <Stat
                icon="battery_horiz_075"
                label="Block fullness"
                value={fullness === undefined ? "pending" : `${fullness.toFixed(1)}%`}
                sub="of 4M weight units"
              />
            </div>

            <section className="panel block-fullness-panel">
              <BlockCapacityMap percent={fullness} />
              <div className="block-capacity-main">
                <div className="block-capacity-heading">
                  <div>
                    <p className="section-kicker">Block filling</p>
                    <h2>{fullness === undefined ? "Pending weight data" : `${fullness.toFixed(2)}%`}</h2>
                  </div>
                  <span>4M WU limit</span>
                </div>
                <div>
                  <p>
                    Bitcoin blocks are limited by weight. This meter tracks the block
                    against the 4,000,000 weight-unit maximum.
                  </p>
                </div>
                <BlockFillBar percent={fullness} />
              </div>
            </section>

          </section>

          <aside className="space-y-5">
            <section className="panel side-detail-panel">
              <h2 className="text-xl font-semibold">Header</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <Detail
                  label="Time"
                  value={formatTime(block.timestamp)}
                  sub="block header timestamp"
                />
                <Detail label="Confirmations" value={formatNumber(block.confirmations)} />
                <Detail label="Merkle root" value={block.merkleroot} mono copy />
                <Detail label="Bits" value={block.bits} mono />
                <Detail label="Nonce" value={block.nonce.toString()} mono />
                <Detail
                  label="Difficulty"
                  value={block.difficulty.toLocaleString("en-US")}
                />
                <Detail label="Weight" value={formatNumber(block.weight)} />
              </dl>
            </section>
          </aside>

          <section className="panel detail-panel lg:col-span-2">
            <div className="panel-heading detail-panel-heading">
              <h2 className="text-xl font-semibold">Transactions</h2>
              <p className="text-sm text-[var(--muted)]">
                Showing {totalTxCount === 0 ? 0 : offset + 1}-{offset + visibleTxCount} of{" "}
                {totalTxCount.toLocaleString("en-US")} transactions.
                {txs ? " Click a row to inspect inputs and outputs." : " Open any txid to inspect the transaction."}
              </p>
            </div>
            {txsError ? (
              <div className="provider-note">
                <MaterialIcon name="info" />
                <p>{txsError}</p>
              </div>
            ) : null}
            <div className="tx-list">
              {txs
                ? txs.transactions.map((tx) => (
                    <article key={tx.txid} className="tx-row tx-card-row">
                      <Link
                        href={networkHref(`/tx/${tx.txid}?block_hash=${block.hash}`, network)}
                        className="tx-main"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Txid
                          </p>
                          <p className="txid-full mt-1 font-mono text-sm">
                            {tx.txid}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Inputs
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold">
                            {tx.input_count}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Outputs
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold">
                            {tx.output_count}
                          </p>
                        </div>
                        <div className="tx-value">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Value
                          </p>
                          <p className="mt-1 font-mono text-sm font-semibold">
                            {formatBtcFromSats(tx.output_value_sat, network)}
                          </p>
                          <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                            {formatFeeRate(tx.fee_rate_sat_vb)}
                          </p>
                          {tx.script_types?.length ? (
                            <div className="tx-script-tags" aria-label="Transaction script types">
                              {tx.script_types.slice(0, 3).map((type) => (
                                <span key={type} className="flow-chip tx-script-chip">
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                      <CopyButton value={tx.txid} label="Copy txid" compact />
                    </article>
                  ))
                : fallbackTxids.map((txid) => (
                    <article key={txid} className="tx-row tx-card-row">
                      <Link
                        href={networkHref(`/tx/${txid}?block_hash=${block.hash}`, network)}
                        className="tx-main tx-main-fallback"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Txid
                          </p>
                          <p className="txid-full mt-1 font-mono text-sm">
                            {txid}
                          </p>
                        </div>
                        <div className="tx-value">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                            Details
                          </p>
                          <p className="mt-1 font-mono text-sm font-semibold">
                            open transaction
                          </p>
                        </div>
                      </Link>
                      <CopyButton value={txid} label="Copy txid" compact />
                    </article>
                  ))}
            </div>
            <div className="panel-footer">
              <div className="pagination-meta">
                Page {Math.floor(offset / TX_PAGE_SIZE) + 1} . {TX_PAGE_SIZE} per page
              </div>
              <div className="pagination-actions">
                {hasPrevious ? (
                  <Link
                    href={networkHref(`/block/${encodeURIComponent(id)}?offset=${previousOffset}`, network)}
                    className="outline-button"
                  >
                    <MaterialIcon name="arrow_back" /> Previous
                  </Link>
                ) : null}
                {hasNext ? (
                  <Link
                    href={networkHref(`/block/${encodeURIComponent(id)}?offset=${nextOffset}`, network)}
                    className="outline-button"
                  >
                    Next <MaterialIcon name="arrow_forward" />
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--accent)]">
        <MaterialIcon name={icon} />
      </div>
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold">{value}</p>
      {sub ? <p className="text-xs text-[var(--muted)]">{sub}</p> : null}
    </section>
  );
}

function BlockFillBar({ percent }: { percent?: number }) {
  const safePercent = percent ?? 0;
  const label = percent === undefined ? "pending" : `${percent.toFixed(1)}%`;
  return (
    <div className="block-fill block-fill-large">
      <div className="block-fill-header">
        <span>Block filling</span>
        <strong>{label}</strong>
      </div>
      <span className="block-fill-track" aria-label={`Block filling ${label}`}>
        <span style={{ width: `${safePercent}%` }} />
      </span>
    </div>
  );
}

function BlockCapacityMap({ percent }: { percent?: number }) {
  const safePercent = Math.min(100, Math.max(0, percent ?? 0));
  const cellCapacity = 100 / CAPACITY_GRID_CELLS;

  return (
    <div
      className="block-capacity-map"
      aria-label={`Block capacity ${percent === undefined ? "pending" : `${percent.toFixed(2)}% full`}`}
      role="img"
    >
      {Array.from({ length: CAPACITY_GRID_CELLS }, (_, index) => {
        const row = Math.floor(index / CAPACITY_GRID_COLUMNS);
        const column = index % CAPACITY_GRID_COLUMNS;
        const fillOrder = (CAPACITY_GRID_ROWS - 1 - row) * CAPACITY_GRID_COLUMNS + column;
        const cellStart = fillOrder * cellCapacity;
        const cellFill = Math.min(100, Math.max(0, ((safePercent - cellStart) / cellCapacity) * 100));

        return (
          <span
            key={index}
            className="block-capacity-cell"
            style={{ "--cell-fill": `${cellFill}%` } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

function Detail({
  label,
  value,
  sub,
  mono = false,
  copy = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  copy?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className={`mt-1 flex items-start gap-2 break-all text-[var(--text)] ${
          mono ? "font-mono text-xs" : "text-sm"
        }`}
      >
        <span>
          {value}
          {sub ? (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              {sub}
            </span>
          ) : null}
        </span>
        {copy && typeof value === "string" ? <CopyButton value={value} label={`Copy ${label}`} compact /> : null}
      </dd>
    </div>
  );
}
