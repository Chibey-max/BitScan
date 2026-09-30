import Link from "next/link";
import CopyButton from "@/app/copy-button";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";
import {
  TransactionDetail,
  compactHash,
  formatBtcFromSats,
  formatBytes,
  formatNumber,
  getJson,
} from "@/app/lib/explorer";

export const dynamic = "force-dynamic";

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
  const suffix = block_hash
    ? `?block_hash=${encodeURIComponent(block_hash)}`
    : "";
  const tx = await getJson<TransactionDetail>(
    `/api/tx/${encodeURIComponent(txid)}${suffix}`,
  );
  const totalOut = tx.outputs.reduce((sum, output) => sum + output.value_sat, 0);

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
              <p className="mono">{tx.txid}</p>
              <CopyButton value={tx.txid} label="Copy txid" compact />
            </div>
          </div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)] reveal-panel reveal-delay-1">
          <section className="space-y-5">
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

            <section className="panel flow-panel">
              <div className="panel-heading detail-panel-heading">
                <div>
                  <h2 className="text-xl font-semibold">Transaction flow</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {tx.inputs.length.toLocaleString("en-US")} input
                    {tx.inputs.length === 1 ? "" : "s"} into{" "}
                    {tx.outputs.length.toLocaleString("en-US")} output
                    {tx.outputs.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="flow-chip">{tx.confirmations ? "confirmed" : "mempool"}</span>
              </div>
              <div className="transaction-flow">
                <div className="flow-spine" aria-hidden="true">
                  <span />
                  <MaterialIcon name="arrow_forward" />
                  <span />
                </div>
                <div className="flow-column">
                  <h3>Inputs</h3>
                  {tx.inputs.map((input, index) => (
                    <article key={`${input.txid ?? "coinbase"}:${index}`} className="flow-item">
                      <p className="flow-label">Input {index}</p>
                      {input.coinbase ? (
                        <p className="mt-2 break-all font-mono text-sm">
                          coinbase {compactHash(input.coinbase, 18, 12)}
                        </p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          <div className="copy-line">
                            <p className="break-all font-mono text-sm">
                              {input.txid}:{input.vout}
                            </p>
                            {input.txid ? (
                              <CopyButton value={input.txid} label="Copy input txid" compact />
                            ) : null}
                          </div>
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
                  {tx.outputs.map((output) => (
                    <article key={output.n} className="flow-item output-item">
                      <div className="flow-output-head">
                        <span>Vout {output.n}</span>
                        <strong>{formatBtcFromSats(output.value_sat)}</strong>
                      </div>
                      <p className="mt-2 truncate font-mono text-sm">
                        {output.address ?? output.script_type ?? "unknown"}
                      </p>
                      {output.address ? (
                        <CopyButton value={output.address} label="Copy address" compact />
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </section>

          <aside className="space-y-5">
            <section className="panel side-detail-panel">
              <h2 className="text-xl font-semibold">Metadata</h2>
              <dl className="mt-4 space-y-4 text-sm">
                <Detail label="Hash" value={tx.hash} mono copy />
                <Detail label="Block" value={tx.blockhash ?? "mempool"} mono copy={Boolean(tx.blockhash)} />
                <Detail label="Size" value={formatBytes(tx.size)} />
                <Detail label="Weight" value={formatNumber(tx.weight)} />
                <Detail label="Version" value={formatNumber(tx.version)} />
                <Detail label="Locktime" value={formatNumber(tx.locktime)} />
              </dl>
            </section>

            <section className="panel note-panel">
              <div className="flex items-start gap-3">
                <MaterialIcon name="tag" className="mt-1 text-[var(--accent)]" />
                <div>
                  <h2 className="text-lg font-semibold">Provider note</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    If a direct txid URL fails, open the containing block first.
                    BitRPC accepts confirmed tx lookup with a block hash.
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
