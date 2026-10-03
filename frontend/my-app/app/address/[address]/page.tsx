import CopyButton from "@/app/copy-button";
import EntityLink from "@/app/entity-link";
import ErrorState from "@/app/error-state";
import {
  AddressDetail,
  errorMessage,
  formatBtcFromSats,
  formatNumber,
  formatRelativeBlockTime,
  getJson,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

export const revalidate = 120;

type PageProps = {
  params: Promise<{ address: string }>;
};

export default async function AddressPage({ params }: PageProps) {
  const { address } = await params;
  let detail: AddressDetail;
  try {
    detail = await getJson<AddressDetail>(
      `/api/address/${encodeURIComponent(address)}`,
      { revalidate: 120 },
    );
  } catch (error) {
    return (
      <ErrorState
        title="Address not available"
        message={errorMessage(
          error,
          "The indexed address provider could not return this address. Check the address or try again shortly.",
        )}
      />
    );
  }
  const transactions = detail.transactions ?? [];
  const source = detail.source ?? "provider";

  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Bitcoin address</div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <h1 className="break-all text-2xl font-semibold tracking-normal sm:text-3xl">
                  {detail.address}
                </h1>
                <CopyButton value={detail.address} label="Copy address" compact />
              </div>
              <p className="mt-3 text-sm text-[var(--muted)]">
                Indexed address data from {source}. Recent activity is normalized by the Rust API before it reaches the UI.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
              {detail.is_valid ? "Valid address" : "Unverified"}
            </div>
          </div>

          <div className="grid border-t border-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Balance" value={formatBtcFromSats(detail.balance_sat)} />
            <Metric label="Received" value={formatBtcFromSats(detail.received_sat)} />
            <Metric label="Sent" value={formatBtcFromSats(detail.sent_sat)} />
            <Metric label="Recent txs" value={formatNumber(detail.tx_count)} />
          </div>
        </div>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold">Recent activity</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Latest indexed transactions involving this address.
              </p>
            </div>
            <MaterialIcon name="account_balance_wallet" className="text-[var(--accent)]" />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {transactions.length > 0 ? (
              transactions.map((tx) => (
                <article
                  key={tx.txid}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[var(--surface-hover)] lg:grid-cols-[minmax(0,1fr)_160px_160px_120px]"
                >
                  <div className="min-w-0">
                    <div className="eyebrow">TXID</div>
                    <EntityLink
                      href={`/tx/${tx.txid}`}
                      value={tx.txid}
                      label="txid"
                      className="mt-1 text-sm"
                    />
                  </div>
                  <TxMetric label="Received" value={formatBtcFromSats(tx.received_sat)} />
                  <TxMetric label="Sent" value={formatBtcFromSats(tx.sent_sat)} />
                  <div>
                    <div className="eyebrow">Status</div>
                    <div className="mt-1 text-sm font-semibold">
                      {tx.block_height ? `#${formatNumber(tx.block_height)}` : "Mempool"}
                    </div>
                    {tx.timestamp ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {formatRelativeBlockTime(tx.timestamp)}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-sm text-[var(--muted)]">
                No indexed transactions were returned for this address.
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--border)] p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="eyebrow">{label}</div>
      <div className="mono mt-2 break-words text-lg font-semibold">{value}</div>
    </div>
  );
}

function TxMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mono mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
