import Link from "next/link";
import CopyButton from "@/app/copy-button";
import ErrorState from "@/app/error-state";
import {
  TransactionDetail,
  errorMessage,
  formatBtcFromSats,
  formatNumber,
  getJson,
  isNetworkUnavailable,
  networkHref,
  networkLabel,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    txid?: string;
    address?: string;
    block_hash?: string;
    network?: string;
  }>;
};

export default async function ReceiptPage({ searchParams }: PageProps) {
  const { txid, address, block_hash, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);

  if (!txid) {
    return (
      <ErrorState
        title="Receipt needs a transaction"
        message="Open a transaction output and choose receipt, or provide a txid query parameter."
        network={network}
      />
    );
  }

  const suffix = block_hash ? `?block_hash=${encodeURIComponent(block_hash)}` : "";
  let tx: TransactionDetail;
  try {
    tx = await getJson<TransactionDetail>(
      withNetwork(`/api/tx/${encodeURIComponent(txid)}${suffix}`, network),
    );
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet receipts are not connected yet"
          message="Receipt generation is network-aware, but this deployment still needs a testnet Bitcoin RPC endpoint."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Receipt not available"
        message={errorMessage(error, "The transaction could not be loaded for this receipt.")}
        secondaryHref={networkHref(`/tx/${txid}${suffix}`, network)}
        secondaryLabel="Open transaction"
        network={network}
      />
    );
  }

  const outputs = tx.outputs ?? [];
  const output = address
    ? outputs.find((item) => item.address === address)
    : outputs.find((item) => item.address) ?? outputs[0];
  const amount = output?.value_sat ?? 0;
  const confirmations = tx.confirmations ?? 0;
  const settled = confirmations >= 6;
  const confidence = confirmations <= 0 ? 0 : confirmations >= 6 ? 99 : Math.min(95, 55 + confirmations * 8);

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link
            href={networkHref(`/tx/${tx.txid}${tx.blockhash ? `?block_hash=${tx.blockhash}` : ""}`, network)}
            className="back-link"
          >
            <MaterialIcon name="arrow_back" />
            Back to transaction
          </Link>
          <div className="mt-5">
            <p className="section-kicker">Payment receipt</p>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              {settled ? "Payment settled" : confirmations > 0 ? "Payment confirmed" : "Payment pending"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {formatBtcFromSats(amount, network)} was observed in this {networkLabel(network)} transaction.
            </p>
          </div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="panel p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric label="Amount" value={formatBtcFromSats(amount, network)} />
              <Metric label="Confirmations" value={formatNumber(confirmations)} />
              <Metric label="Confidence" value={`${confidence}%`} />
            </div>

            <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Receipt status</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Confidence is based on confirmation depth for this transaction.
                  </p>
                </div>
                <span className="flow-chip">{settled ? "settled" : confirmations > 0 ? "confirmed" : "pending"}</span>
              </div>
              <div className="mt-5 grid gap-3">
                <Check ok={Boolean(tx.blockhash)} label={tx.blockhash ? "Block hash attached" : "Waiting for block hash"} />
                <Check ok={confirmations > 0} label={confirmations > 0 ? "Transaction is mined" : "Transaction is not mined yet"} />
                <Check ok={Boolean(output)} label={output ? "Output matched" : "No matching output found"} />
              </div>
            </div>
          </section>

          <aside className="panel side-detail-panel">
            <h2 className="text-xl font-semibold">Proof details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail label="Transaction" value={tx.txid} href={networkHref(`/tx/${tx.txid}${tx.blockhash ? `?block_hash=${tx.blockhash}` : ""}`, network)} copy />
              <Detail label="Address" value={output?.address ?? address ?? "not address-based"} href={output?.address ? networkHref(`/address/${output.address}`, network) : undefined} copy={Boolean(output?.address)} />
              <Detail label="Block" value={tx.blockhash ?? "mempool"} href={tx.blockhash ? networkHref(`/block/${tx.blockhash}`, network) : undefined} copy={Boolean(tx.blockhash)} />
              <Detail label="Output index" value={output ? `vout ${output.n}` : "not matched"} />
            </dl>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
      <span className={`grid h-7 w-7 place-items-center rounded-full border ${ok ? "border-[var(--green)] text-[var(--green)]" : "border-[var(--border)] text-[var(--muted)]"}`}>
        <MaterialIcon name={ok ? "check" : "schedule"} />
      </span>
      {label}
    </div>
  );
}

function Detail({
  label,
  value,
  href,
  copy = false,
}: {
  label: string;
  value: string;
  href?: string;
  copy?: boolean;
}) {
  const content = href ? (
    <Link href={href} className="entity-link">{value}</Link>
  ) : (
    <span>{value}</span>
  );

  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 flex items-start gap-2 break-all font-mono text-xs text-[var(--text)]">
        {content}
        {copy ? <CopyButton value={value} label={`Copy ${label}`} compact /> : null}
      </dd>
    </div>
  );
}
