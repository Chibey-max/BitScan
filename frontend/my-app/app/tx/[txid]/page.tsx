import Link from "next/link";
import { redirect } from "next/navigation";
import CopyButton from "@/app/copy-button";
import EntityLink from "@/app/entity-link";
import ErrorState from "@/app/error-state";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";
import {
  TransactionDetail,
  compactHash,
  errorMessage,
  formatBtcFromSats,
  formatBytes,
  formatNumber,
  getTransactionDetail,
  resolveTxBlockHash,
} from "@/app/lib/explorer";

export const revalidate = 300;

type PageProps = {
  params: Promise<{ txid: string }>;
  searchParams: Promise<{ block_hash?: string }>;
};

export default async function TransactionPage({
  params,
  searchParams,
}: PageProps) {
  const { txid } = await params;
  const { block_hash } = await searchParams;
  if (!block_hash) {
    const resolvedBlockHash = await resolveTxBlockHash(txid);
    if (resolvedBlockHash) {
      redirect(`/tx/${txid}?block_hash=${resolvedBlockHash}`);
    }
  }

  let tx: TransactionDetail;
  try {
    tx = await getTransactionDetail(txid, block_hash);
  } catch (error) {
    return (
      <ErrorState
        title="Transaction not available"
        message={errorMessage(
          error,
          "The provider could not return this transaction. If this is an old confirmed tx, open it from its block so the request can include the block hash.",
        )}
        secondaryHref={block_hash ? `/block/${block_hash}` : undefined}
        secondaryLabel={block_hash ? "Open block" : undefined}
      />
    );
  }
  const inputs = tx.inputs ?? [];
  const outputs = tx.outputs ?? [];
  const story = {
    kind: tx.story?.kind ?? "unknown",
    headline: tx.story?.headline ?? "Transaction details",
    sentences:
      tx.story?.sentences?.length
        ? tx.story.sentences
        : [
            "BitScan could not classify this transaction, but the decoded inputs and outputs are shown below.",
          ],
    change_output: tx.story?.change_output,
    confidence: tx.story?.confidence ?? "provider fallback",
    tags: tx.story?.tags ?? [],
  };
  const receiptOutput = outputs.find((output) => output.address);
  const totalOut = outputs.reduce(
    (sum, output) => sum + (output.value_sat ?? 0),
    0,
  );

  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link
            href={tx.blockhash ? `/block/${tx.blockhash}` : "/"}
            className="back-link"
          >
            <MaterialIcon name="arrow_back" />
            {tx.blockhash ? "Back to block" : "Explorer"}
          </Link>
          <div className="mt-5">
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              Transaction
            </h1>
            <div className="hash-line">
              <Link href={`/tx/${tx.txid}${tx.blockhash ? `?block_hash=${tx.blockhash}` : ""}`} className="entity-link mono">
                {tx.txid}
              </Link>
              <CopyButton value={tx.txid} label="Copy txid" compact />
            </div>
          </div>
        </header>

        <div className="tx-detail-grid reveal-panel reveal-delay-1">
          <section className="tx-primary-column">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat
                icon="deployed_code"
                label="Confirmations"
                value={formatNumber(tx.confirmations)}
              />
              <Stat
                icon="currency_bitcoin"
                label="Output total"
                value={formatBtcFromSats(totalOut)}
              />
              <Stat
                icon="database"
                label="Virtual size"
                value={formatBytes(tx.vsize)}
                sub="vbytes"
              />
              <Stat
                icon="lock"
                label="Fee"
                value={
                  tx.fee_sat === undefined
                    ? "needs prevouts"
                    : `${formatNumber(tx.fee_sat)} sats`
                }
              />
            </div>

            <section className="panel note-panel">
              <div className="flex items-start gap-3">
                <MaterialIcon name="auto_stories" className="mt-1 text-[var(--accent)]" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{story.headline}</h2>
                    <span className="flow-chip">{story.confidence}</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
                    {story.sentences.map((sentence) => (
                      <p key={sentence}>{sentence}</p>
                    ))}
                  </div>
                  {story.tags.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {story.tags.map((tag) => (
                        <span key={tag} className="query-chip">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {tx.fee_report ? (
              <section className="panel block-fullness-panel">
                <div>
                  <p className="section-kicker">Fee report card</p>
                  <h2>Grade {tx.fee_report.grade ?? "pending"}</h2>
                  <p>
                    {tx.fee_report.verdict ?? "Fee comparison is partially available."} Fee rate:{" "}
                    {tx.fee_report.fee_rate_sat_vb ?? "pending"} sat/vB.
                  </p>
                </div>
                <FeeStrip report={tx.fee_report} />
              </section>
            ) : null}

          </section>

          <aside className="tx-side-column">
            <section className="panel side-detail-panel">
              <h2 className="text-xl font-semibold">Metadata</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <Detail label="Hash" value={tx.hash} mono copy />
                <Detail
                  label="Block"
                  value={tx.blockhash ?? "mempool"}
                  href={tx.blockhash ? `/block/${tx.blockhash}` : undefined}
                  mono
                  copy={Boolean(tx.blockhash)}
                />
                <Detail label="Size" value={formatBytes(tx.size)} />
                <Detail label="Weight" value={formatNumber(tx.weight)} />
                <Detail label="Version" value={formatNumber(tx.version)} />
                <Detail label="Locktime" value={formatNumber(tx.locktime)} />
              </dl>
            </section>

            <section className="panel note-panel">
              <div className="flex items-start gap-3">
                <MaterialIcon name="receipt_long" className="mt-1 text-[var(--accent)]" />
                <div>
                  <h2 className="text-lg font-semibold">Payment receipt</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Open a clean proof-of-payment receipt for any output address
                    in this transaction.
                  </p>
                  {receiptOutput ? (
                    <Link
                      href={`/receipt?txid=${tx.txid}&address=${receiptOutput.address ?? ""}${tx.blockhash ? `&block_hash=${tx.blockhash}` : ""}`}
                      className="outline-button mt-4"
                    >
                      <MaterialIcon name="open_in_new" />
                      Open receipt
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          </aside>

          <section className="panel flow-panel tx-flow-wide">
            <div className="panel-heading detail-panel-heading">
              <div>
                <h2 className="text-xl font-semibold">Transaction flow</h2>
                <p className="text-sm text-[var(--muted)]">
                  {inputs.length.toLocaleString("en-US")} input
                  {inputs.length === 1 ? "" : "s"} into{" "}
                  {outputs.length.toLocaleString("en-US")} output
                  {outputs.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="flow-chip">{tx.confirmations ? "confirmed" : "mempool"}</span>
            </div>
            <div className="transaction-flow">
              <div className="flow-column">
                <h3>Inputs</h3>
                {inputs.map((input, index) => (
                  <article key={`${input.txid ?? "coinbase"}:${index}`} className="flow-item">
                    <p className="flow-label">Input {index}</p>
                    {input.coinbase ? (
                      <p className="mt-2 break-all font-mono text-sm">
                        coinbase {compactHash(input.coinbase, 18, 12)}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {input.txid ? (
                          <EntityLink
                            href={`/tx/${input.txid}`}
                            value={input.txid}
                            displayValue={`${input.txid}:${input.vout}`}
                            copyValue={input.txid}
                            label="input txid"
                            className="text-sm"
                          />
                        ) : null}
                        <p className="text-sm text-[var(--muted)]">
                          Previous output:{" "}
                          {input.previous_output
                            ? formatBtcFromSats(input.previous_output.value_sat)
                            : "not available from provider"}
                        </p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div className="flow-column">
                <h3>Outputs</h3>
                {outputs.map((output) => (
                  <article key={output.n} className="flow-item output-item">
                    <div className="flow-output-head">
                      <span>Vout {output.n}</span>
                      <strong>{formatBtcFromSats(output.value_sat)}</strong>
                    </div>
                    {output.address ? (
                      <EntityLink
                        href={`/address/${output.address}`}
                        value={output.address}
                        label="address"
                        className="mt-2 text-sm"
                      />
                    ) : (
                      <p className="mt-2 break-all font-mono text-sm">
                        {output.script_type ?? "unknown"}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function FeeStrip({ report }: { report: NonNullable<TransactionDetail["fee_report"]> }) {
  const percentile = report.percentile ?? undefined;
  const feeRate = report.fee_rate_sat_vb ?? 0;
  const marker = percentile ?? Math.min(100, feeRate * 4);
  return (
    <div className="block-fill block-fill-large">
      <span className="block-fill-track">
        <span style={{ width: `${Math.min(100, marker)}%` }} />
      </span>
      <span className="block-fill-label">
        {percentile === undefined ? "fallback grade" : `${percentile.toFixed(1)} percentile`}
      </span>
    </div>
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
      <p className="mt-2 break-words font-mono text-lg font-semibold">
        {value}
      </p>
      {sub ? <p className="text-xs text-[var(--muted)]">{sub}</p> : null}
    </section>
  );
}

function Detail({
  label,
  value,
  href,
  mono = false,
  copy = false,
}: {
  label: string;
  value: string;
  href?: string;
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
        {href ? (
          <Link href={href} className="entity-link">
            {value}
          </Link>
        ) : (
          <span>{value}</span>
        )}
        {copy ? <CopyButton value={value} label={`Copy ${label}`} compact /> : null}
      </dd>
    </div>
  );
}
