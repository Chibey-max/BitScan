import { Suspense } from "react";
import Link from "next/link";
import CopyButton from "@/app/copy-button";
import EntityLink from "@/app/entity-link";
import ErrorState from "@/app/error-state";
import Loading from "@/app/loading";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";
import {
  NetworkKey,
  REVALIDATE,
  TransactionDetail,
  compactHash,
  errorMessage,
  formatBtcFromSats,
  formatBytes,
  formatFeeRate,
  formatNumber,
  getJson,
  isNetworkUnavailable,
  networkHref,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";

// Not `force-dynamic` — see the note in app/lib/explorer.ts on getJson.

type PageProps = {
  params: Promise<{ txid: string }>;
  searchParams: Promise<{ block_hash?: string; network?: string }>;
};

export default async function TransactionPage({
  params,
  searchParams,
}: PageProps) {
  const { txid } = await params;
  const { block_hash, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);

  return (
    <Suspense key={`${network}:${txid}:${block_hash ?? ""}`} fallback={<Loading />}>
      <TransactionView txid={txid} network={network} blockHash={block_hash} />
    </Suspense>
  );
}

async function TransactionView({
  txid,
  network,
  blockHash,
}: {
  txid: string;
  network: NetworkKey;
  blockHash?: string;
}) {
  const suffix = blockHash ? `?block_hash=${encodeURIComponent(blockHash)}` : "";
  let tx: TransactionDetail;
  try {
    tx = await getJson<TransactionDetail>(
      withNetwork(`/api/tx/${encodeURIComponent(txid)}${suffix}`, network),
      REVALIDATE.immutable,
    );
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet is not connected yet"
          message="BitScan can route testnet transaction lookups, but the backend still needs a testnet Bitcoin RPC endpoint."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Transaction not available"
        message={errorMessage(
          error,
          "The provider could not return this transaction. If this is an old confirmed tx, open it from its block so the request can include the block hash.",
        )}
        secondaryHref={blockHash ? networkHref(`/block/${blockHash}`, network) : undefined}
        secondaryLabel={blockHash ? "Open block" : undefined}
        network={network}
      />
    );
  }
  const inputs = tx.inputs ?? [];
  const outputs = tx.outputs ?? [];
  const totalOut = outputs.reduce(
    (sum, output) => sum + (output.value_sat ?? 0),
    0,
  );

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link
            href={tx.blockhash ? networkHref(`/block/${tx.blockhash}`, network) : networkHref("/", network)}
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
              <Link href={networkHref(`/tx/${tx.txid}${tx.blockhash ? `?block_hash=${tx.blockhash}` : ""}`, network)} className="entity-link mono">
                {tx.txid}
              </Link>
              <CopyButton value={tx.txid} label="Copy txid" compact />
            </div>
          </div>
        </header>

        <div className="tx-detail-grid reveal-panel reveal-delay-1">
          <div className="tx-stats-grid">
            <Stat
              icon="deployed_code"
              label="Confirmations"
              value={formatNumber(tx.confirmations)}
            />
            <Stat
              icon="currency_bitcoin"
              label="Output total"
              value={formatBtcFromSats(totalOut, network)}
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
                  ? "pending sats"
                  : `${formatNumber(tx.fee_sat)} sats`
              }
            />
          </div>

          <section className="panel side-detail-panel tx-metadata-panel">
            <h2 className="text-xl font-semibold">Metadata</h2>
            <dl className="tx-metadata-list">
              <Detail label="Hash" value={tx.hash} mono copy />
              <Detail
                label="Block"
                value={tx.blockhash ?? "mempool"}
                href={tx.blockhash ? networkHref(`/block/${tx.blockhash}`, network) : undefined}
                mono
                copy={Boolean(tx.blockhash)}
              />
              <Detail label="Size" value={formatBytes(tx.size)} />
              <Detail label="Weight" value={formatNumber(tx.weight)} />
              <Detail label="Version" value={formatNumber(tx.version)} />
              <Detail label="Locktime" value={formatNumber(tx.locktime)} />
            </dl>
          </section>

          <section className="panel tx-intel-panel">
            <div className="tx-intel-head">
              <span className="tx-intel-icon"><MaterialIcon name="speed" /></span>
              <div>
                <p className="section-kicker">Fee intelligence</p>
                <h2>Grade {tx.fee_grade?.grade ?? tx.fee_report?.grade ?? "n/a"}</h2>
              </div>
            </div>
            <p className="tx-intel-copy">
              {tx.fee_grade?.verdict ?? tx.fee_report?.verdict ?? "Fee rate unavailable."}
            </p>
            <div className="tx-intel-grid">
              <MiniMetric label="Fee rate" value={formatFeeRate(tx.fee_rate_sat_vb ?? tx.fee_report?.fee_rate_sat_vb)} />
              <MiniMetric
                label="Target"
                value={tx.fee_grade?.target_blocks ? `${tx.fee_grade.target_blocks} block${tx.fee_grade.target_blocks === 1 ? "" : "s"}` : "not available"}
              />
            </div>
            <FeeStrip percentile={tx.fee_report?.percentile ?? null} feeRate={tx.fee_rate_sat_vb ?? tx.fee_report?.fee_rate_sat_vb} />
          </section>

          {tx.summary ? (
            <section className="panel tx-intel-panel">
              <div className="tx-intel-head">
                <span className="tx-intel-icon"><MaterialIcon name="account_tree" /></span>
                <div>
                  <p className="section-kicker">Transaction intelligence</p>
                  <h2>{tx.summary.is_coinbase ? "Coinbase transaction" : tx.summary.has_op_return ? "Data-carrying transaction" : "Standard spend"}</h2>
                </div>
              </div>
              <p className="tx-intel-copy">{tx.summary.explanation}</p>
              <div className="tx-intel-grid">
                <MiniMetric label="Inputs" value={inputs.length.toLocaleString("en-US")} />
                <MiniMetric label="Outputs" value={outputs.length.toLocaleString("en-US")} />
                <MiniMetric label="Total out" value={formatBtcFromSats(totalOut, network)} />
              </div>
              {tx.summary.script_types.length ? (
                <div className="tx-chip-row">
                  {tx.summary.script_types.map((type) => (
                    <span key={type} className="flow-chip">{type}</span>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

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
                            href={networkHref(`/tx/${input.txid}`, network)}
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
                            ? formatBtcFromSats(input.previous_output.value_sat, network)
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
                      <strong>{formatBtcFromSats(output.value_sat, network)}</strong>
                    </div>
                    {output.address ? (
                      <div className="mt-2 space-y-3">
                        <EntityLink
                          href={networkHref(`/address/${output.address}`, network)}
                          value={output.address}
                          label="address"
                          className="text-sm"
                        />
                        <Link
                          href={networkHref(
                            `/receipt?txid=${tx.txid}&address=${output.address}${tx.blockhash ? `&block_hash=${tx.blockhash}` : ""}`,
                            network,
                          )}
                          className="outline-button"
                        >
                          <MaterialIcon name="receipt_long" />
                          Receipt
                        </Link>
                      </div>
                    ) : (
                      <p className="mt-2 break-all font-mono text-sm">
                        {output.script_type ?? "unknown"}
                      </p>
                    )}
                    {output.decoded_op_return ? (
                      <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
                        {output.decoded_op_return}
                      </p>
                    ) : null}
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="tx-mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FeeStrip({
  percentile,
  feeRate,
}: {
  percentile?: number | null;
  feeRate?: number;
}) {
  const marker = percentile ?? Math.min(100, (feeRate ?? 0) * 4);
  return (
    <div className="block-fill block-fill-large">
      <span className="block-fill-track">
        <span style={{ width: `${Math.min(100, marker)}%` }} />
      </span>
      <span className="block-fill-label">
        {percentile === undefined || percentile === null ? "fee-rate band" : `${percentile.toFixed(1)} percentile`}
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
