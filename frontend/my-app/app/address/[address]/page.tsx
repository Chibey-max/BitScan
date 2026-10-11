import { Suspense } from "react";
import Link from "next/link";
import CopyButton from "@/app/copy-button";
import EntityLink from "@/app/entity-link";
import ErrorState from "@/app/error-state";
import Loading from "@/app/loading";
import {
  NetworkKey,
  REVALIDATE,
  AddressDetail,
  errorMessage,
  formatBtcFromSats,
  formatNumber,
  formatRelativeBlockTime,
  getJson,
  isNetworkUnavailable,
  networkHref,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

// Not `force-dynamic` — see the note in app/lib/explorer.ts on getJson.

const TX_PAGE_SIZE = 25;

type PageProps = {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ offset?: string; network?: string }>;
};

export default async function AddressPage({ params, searchParams }: PageProps) {
  const { address } = await params;
  const { offset: offsetParam, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);
  const offset = offsetParam && /^\d+$/.test(offsetParam) ? Number(offsetParam) : 0;

  return (
    <Suspense key={`${network}:${address}:${offset}`} fallback={<Loading />}>
      <AddressView address={address} network={network} offset={offset} />
    </Suspense>
  );
}

async function AddressView({
  address,
  network,
  offset,
}: {
  address: string;
  network: NetworkKey;
  offset: number;
}) {
  let detail: AddressDetail;
  try {
    detail = await getJson<AddressDetail>(
      withNetwork(
        `/api/address/${encodeURIComponent(address)}?limit=${TX_PAGE_SIZE}&offset=${offset}`,
        network,
      ),
      REVALIDATE.address,
    );
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet is not connected yet"
          message="Address lookup is network-aware, but this deployment still needs a testnet RPC and indexed provider before testnet addresses can be explored."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Address not available"
        message={errorMessage(
          error,
          "The address indexer could not return this address. Check the address or try again shortly.",
        )}
        network={network}
      />
    );
  }

  const transactions = detail.transactions;
  // The indexer reports no total count, so a full page is the only signal that
  // more history exists.
  const hasNext = transactions.length === detail.limit;
  const hasPrevious = offset > 0;
  const previousOffset = Math.max(0, offset - detail.limit);
  const nextOffset = offset + detail.limit;

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
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
                Checksum validated locally by the Rust API. Balances and history are
                indexed by {detail.source}, since Bitcoin Core RPC has no address index.
                {detail.totals_complete
                  ? ""
                  : " This fallback index only covers recent blocks, so the figures below are partial."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--muted)]">
                <span className="h-2 w-2 rounded-full bg-[var(--green)]" />
                {detail.is_valid ? "Valid address" : "Unverified"}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold text-[var(--muted)]">
                <MaterialIcon name="hub" />
                {detail.address_type ?? "bitcoin address"}
              </div>
            </div>
          </div>

          <div className="grid border-t border-[var(--border)] sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label={detail.totals_complete ? "Balance" : "Balance (partial)"}
              value={`${formatNumber(detail.balance_sat)} sats`}
              secondary={formatBtcFromSats(detail.balance_sat, network)}
            />
            <Metric
              label={detail.totals_complete ? "Total received" : "Received (recent)"}
              value={`${formatNumber(detail.received_sat)} sats`}
              secondary={formatBtcFromSats(detail.received_sat, network)}
            />
            <Metric
              label={detail.totals_complete ? "Total sent" : "Sent (recent)"}
              value={`${formatNumber(detail.sent_sat)} sats`}
              secondary={formatBtcFromSats(detail.sent_sat, network)}
            />
            <Metric
              label="Pending"
              value={`${formatNumber(detail.pending_balance_sat)} sats`}
              secondary={
                detail.pending_balance_sat === 0
                  ? "nothing unconfirmed"
                  : formatBtcFromSats(detail.pending_balance_sat, network)
              }
            />
          </div>
        </div>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold">Transaction history</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {transactions.length > 0
                  ? `Showing ${formatNumber(offset + 1)}-${formatNumber(offset + transactions.length)}, newest first.`
                  : "Transactions involving this address, newest first."}
              </p>
            </div>
            <MaterialIcon
              name="account_balance_wallet"
              className="text-[var(--accent)]"
            />
          </div>

          <div className="divide-y divide-[var(--border)]">
            {transactions.length > 0 ? (
              transactions.map((tx) => (
                <article
                  key={tx.txid}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[var(--surface-hover)] lg:grid-cols-[minmax(0,1fr)_130px_150px_150px_140px]"
                >
                  <div className="min-w-0">
                    <div className="eyebrow">Txid</div>
                    <EntityLink
                      href={networkHref(`/tx/${tx.txid}`, network)}
                      value={tx.txid}
                      label="txid"
                      className="mt-1 text-sm"
                    />
                  </div>
                  <TxMetric
                    label="Direction"
                    value={
                      tx.spends_from_address
                        ? tx.received_sat > 0
                          ? "Sent + change"
                          : "Sent"
                        : "Received"
                    }
                  />
                  <TxMetric
                    label="Received"
                    value={
                      tx.received_sat > 0
                        ? `${formatNumber(tx.received_sat)} sats`
                        : "—"
                    }
                    secondary={
                      tx.received_sat > 0
                        ? formatBtcFromSats(tx.received_sat, network)
                        : undefined
                    }
                  />
                  <TxMetric
                    label="Sent"
                    value={
                      tx.sent_sat ? `${formatNumber(tx.sent_sat)} sats` : "—"
                    }
                    secondary={
                      tx.sent_sat
                        ? formatBtcFromSats(tx.sent_sat, network)
                        : undefined
                    }
                  />
                  <div>
                    <div className="eyebrow">Block</div>
                    <div className="mono mt-1 text-sm font-semibold">
                      {tx.block_height
                        ? `#${formatNumber(tx.block_height)}`
                        : "Mempool"}
                    </div>
                    {tx.timestamp ? (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {formatRelativeBlockTime(tx.timestamp)}
                      </div>
                    ) : null}
                    {tx.fee_sat ? (
                      <div className="mono mt-1 text-xs text-[var(--muted)]">
                        fee {formatNumber(tx.fee_sat)} sats
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="px-6 py-12 text-center text-sm text-[var(--muted)]">
                {hasPrevious
                  ? "No further transactions on this page."
                  : "The indexer returned no transactions for this address."}
              </div>
            )}
          </div>

          {hasPrevious || hasNext ? (
            <div className="panel-footer">
              <div className="pagination-meta">
                Page {Math.floor(offset / detail.limit) + 1} . {detail.limit} per page
              </div>
              <div className="pagination-actions">
                {hasPrevious ? (
                  <Link
                    href={networkHref(`/address/${encodeURIComponent(detail.address)}?offset=${previousOffset}`, network)}
                    className="outline-button"
                  >
                    <MaterialIcon name="arrow_back" /> Previous
                  </Link>
                ) : null}
                {hasNext ? (
                  <Link
                    href={networkHref(`/address/${encodeURIComponent(detail.address)}?offset=${nextOffset}`, network)}
                    className="outline-button"
                  >
                    Next <MaterialIcon name="arrow_forward" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}

          {detail.totals_complete ? null : (
            <div className="provider-note">
              <MaterialIcon name="warning" />
              <p>
                The address-indexing provider could not be reached, so these figures
                come from BitScan&apos;s own index, which only retains recent blocks.
                Balance and totals are therefore partial and will understate any
                address with older history.
              </p>
            </div>
          )}

          <div className="provider-note">
            <MaterialIcon name="info" />
            <p>
              Totals come from the address indexer&apos;s balance endpoint and cover
              the address&apos;s whole history. The provider reports input addresses as
              null, so per-transaction <em>Sent</em> amounts come from BitScan&apos;s own
              index and show <em>—</em> for transactions older than its window.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="border-t border-[var(--border)] p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="eyebrow">{label}</div>
      <div className="mono mt-2 break-words text-lg font-semibold">{value}</div>
      {secondary ? (
        <div className="mono mt-1 text-xs text-[var(--muted)]">{secondary}</div>
      ) : null}
    </div>
  );
}

function TxMetric({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mono mt-1 text-sm font-semibold">{value}</div>
      {secondary ? (
        <div className="mono mt-1 text-xs text-[var(--muted)]">{secondary}</div>
      ) : null}
    </div>
  );
}
