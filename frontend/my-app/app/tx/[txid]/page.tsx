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
          "The provider could not return this transaction. Check the txid and try again.",
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
  const decoderRows = buildDecoderRows(tx, inputs.length, outputs.length, totalOut, network);
  const scriptGuide = buildScriptGuide(outputs);

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
              <Link href={networkHref(`/tx/${tx.txid}`, network)} className="entity-link mono">
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

          <section className="panel tx-decoder-panel">
            <div className="tx-decoder-header">
              <div>
                <p className="section-kicker">Transaction decoding</p>
                <h2>Readable byte map</h2>
              </div>
              <span className="flow-chip">{tx.hash !== tx.txid ? "segwit" : "legacy"}</span>
            </div>
            <div className="decoder-grid">
              {decoderRows.map((row) => (
                <div key={row.label} className="decoder-row">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <p>{row.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel learnme-panel">
            <div className="tx-decoder-header">
              <div>
                <p className="section-kicker">Learn this transaction</p>
                <h2>What to notice</h2>
              </div>
              <MaterialIcon name="school" />
            </div>
            <div className="lesson-strip">
              <Lesson
                title={tx.summary?.is_coinbase ? "Coinbase input" : "Inputs spend old outputs"}
                body={
                  tx.summary?.is_coinbase
                    ? "The input creates the block subsidy and fees for the miner, so it has no previous txid."
                    : "Every normal input points to a previous transaction output with a txid and vout index."
                }
              />
              <Lesson
                title="Outputs lock value"
                body="Each output has a value and locking script. The address is a readable form of that script when the provider can decode it."
              />
              <Lesson
                title="Fees are the difference"
                body={
                  tx.fee_sat === undefined
                    ? "The fee is unavailable because the provider did not return every previous output."
                    : `${formatNumber(tx.fee_sat)} sats paid to miners, measured as ${formatFeeRate(tx.fee_rate_sat_vb)}.`
                }
              />
            </div>
            {scriptGuide.length ? (
              <div className="script-guide">
                {scriptGuide.map((item) => (
                  <span key={item} className="flow-chip">{item}</span>
                ))}
              </div>
            ) : null}
          </section>

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
                      <p className="op-return-data mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
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

function buildDecoderRows(
  tx: TransactionDetail,
  inputCount: number,
  outputCount: number,
  totalOut: number,
  network: NetworkKey,
) {
  const feeRate = tx.fee_rate_sat_vb ?? tx.fee_report?.fee_rate_sat_vb;
  return [
    {
      label: "Version",
      value: formatNumber(tx.version),
      detail: "Tells nodes which transaction rules this data format follows.",
    },
    {
      label: "Input counter",
      value: inputCount.toLocaleString("en-US"),
      detail: inputCount === 1 ? "One previous output is being spent." : "Multiple previous outputs are funding this spend.",
    },
    {
      label: "Output counter",
      value: outputCount.toLocaleString("en-US"),
      detail: `${formatBtcFromSats(totalOut, network)} is locked into new outputs.`,
    },
    {
      label: "Witness data",
      value: tx.hash !== tx.txid ? "Present" : "Not separate",
      detail: tx.hash !== tx.txid ? "The witness changes the transaction hash, so this is a SegWit-style transaction." : "The txid and hash match, so no separate witness hash was reported.",
    },
    {
      label: "Fee rate",
      value: formatFeeRate(feeRate),
      detail: "Fee rate is the miner fee divided by virtual size.",
    },
    {
      label: "Locktime",
      value: formatNumber(tx.locktime),
      detail: tx.locktime ? "This transaction includes a final-time or final-height constraint." : "Zero locktime means it can be mined as soon as inputs are valid.",
    },
  ];
}

function buildScriptGuide(outputs: TransactionDetail["outputs"]) {
  const types = new Set<string>();
  outputs?.forEach((output) => {
    if (output.script_type) types.add(output.script_type);
  });
  return Array.from(types).slice(0, 6);
}

function Lesson({ title, body }: { title: string; body: string }) {
  return (
    <article className="lesson-card">
      <strong>{title}</strong>
      <p>{body}</p>
    </article>
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
