import Link from "next/link";
import CopyButton from "@/app/copy-button";
import SiteHeader from "@/app/site-header";
import {
  BlockDetail,
  BlockTransactions,
  blockFullnessPercent,
  compactHash,
  formatBtcFromSats,
  formatBytes,
  formatNumber,
  formatTime,
  getJson,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offset?: string }>;
};

const TX_PAGE_SIZE = 12;

export default async function BlockPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { offset: offsetParam } = await searchParams;
  const offset = offsetParam && /^\d+$/.test(offsetParam) ? Number(offsetParam) : 0;
  const block = await getJson<BlockDetail>(`/api/block/${encodeURIComponent(id)}`);
  const txs = await getJson<BlockTransactions>(
    `/api/block/${encodeURIComponent(id)}/txs?limit=${TX_PAGE_SIZE}&offset=${offset}`,
  );
  const previousOffset = Math.max(0, offset - TX_PAGE_SIZE);
  const nextOffset = offset + txs.transactions.length;
  const hasPrevious = offset > 0;
  const hasNext = offset + txs.transactions.length < txs.total;
  const fullness = blockFullnessPercent(block.weight);

  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link
            href="/"
            className="back-link"
          >
            <MaterialIcon name="chevron_left" />
            Explorer
          </Link>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
                Block {block.height.toLocaleString("en-US")}
              </h1>
              <div className="hash-line">
                <p className="mono">{block.hash}</p>
                <CopyButton value={block.hash} label="Copy hash" compact />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {block.previous_block_hash ? (
                <Link
                  href={`/block/${block.height - 1}`}
                  className="outline-button"
                >
                  <MaterialIcon name="arrow_back" />
                  Previous
                </Link>
              ) : null}
              {block.next_block_hash ? (
                <Link
                  href={`/block/${block.height + 1}`}
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
                icon="deployed_code"
                label="Confirmations"
                value={formatNumber(block.confirmations)}
              />
              <Stat
                icon="battery_horiz_075"
                label="Block fullness"
                value={fullness === undefined ? "pending" : `${fullness.toFixed(1)}%`}
                sub="of 4M weight units"
              />
            </div>

            <section className="panel block-fullness-panel">
              <div>
                <p className="section-kicker">Block capacity</p>
                <h2>{fullness === undefined ? "Pending weight data" : `${fullness.toFixed(1)}% full`}</h2>
                <p>
                  Bitcoin blocks are limited by weight. This bar tracks the block
                  against the 4,000,000 weight-unit maximum.
                </p>
              </div>
              <BlockFillBar percent={fullness} />
            </section>

            <section className="panel detail-panel">
              <div className="panel-heading detail-panel-heading">
                <h2 className="text-xl font-semibold">Transactions</h2>
                <p className="text-sm text-[var(--muted)]">
                  Showing {offset + 1}-{offset + txs.transactions.length} of{" "}
                  {txs.total.toLocaleString("en-US")} transactions. Click a row
                  to inspect inputs and outputs.
                </p>
              </div>
              <div className="tx-list">
                {txs.transactions.map((tx) => (
                  <article key={tx.txid} className="tx-row tx-card-row">
                    <Link
                      href={`/tx/${tx.txid}?block_hash=${block.hash}`}
                      className="tx-main"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                          Txid
                        </p>
                        <p className="mt-1 font-mono text-sm">
                          {compactHash(tx.txid, 18, 12)}
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
                          {formatBtcFromSats(tx.output_value_sat)}
                        </p>
                      </div>
                    </Link>
                    <CopyButton value={tx.txid} label="Copy txid" compact />
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
                      href={`/block/${encodeURIComponent(id)}?offset=${previousOffset}`}
                      className="outline-button"
                    >
                      <MaterialIcon name="arrow_back" /> Previous
                    </Link>
                  ) : null}
                  {hasNext ? (
                    <Link
                      href={`/block/${encodeURIComponent(id)}?offset=${nextOffset}`}
                      className="outline-button"
                    >
                      Next <MaterialIcon name="arrow_forward" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          </section>

          <aside className="space-y-5">
            <section className="panel side-detail-panel">
              <h2 className="text-xl font-semibold">Header</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <Detail label="Time" value={formatTime(block.timestamp)} />
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

            <section className="panel note-panel">
              <div className="flex items-start gap-3">
                <MaterialIcon name="tag" className="mt-1 text-[var(--accent)]" />
                <div>
                  <h2 className="text-lg font-semibold">Lookup note</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    BitRPC can resolve confirmed transactions reliably when the
                    request includes this block hash. That is why tx links carry
                    it forward.
                  </p>
                </div>
              </div>
            </section>
          </aside>
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
  return (
    <div className="block-fill block-fill-large">
      <span className="block-fill-track">
        <span style={{ width: `${safePercent}%` }} />
      </span>
      <span className="block-fill-label">
        {percent === undefined ? "pending" : `${percent.toFixed(1)}%`}
      </span>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
  copy = false,
}: {
  label: string;
  value: string;
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
        <span>{value}</span>
        {copy ? <CopyButton value={value} label={`Copy ${label}`} compact /> : null}
      </dd>
    </div>
  );
}
