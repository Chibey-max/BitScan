import Link from "next/link";
import ErrorState from "@/app/error-state";
import {
  BlockTransactions,
  BlocksResponse,
  TxSummary,
  errorMessage,
  formatBtcFromSats,
  formatFeeRate,
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
  searchParams: Promise<{ network?: string }>;
};

type RecentTx = TxSummary & {
  block_height: number;
  block_hash: string;
};

export default async function TransactionsPage({ searchParams }: PageProps) {
  const { network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);
  let rows: RecentTx[] = [];
  let warning: string | undefined;

  try {
    const blockPage = await getJson<BlocksResponse>(withNetwork("/api/blocks?limit=4", network));
    for (const block of blockPage.blocks) {
      if (rows.length >= 24) break;
      try {
        const txPage = await getJson<BlockTransactions>(
          withNetwork(`/api/block/${block.hash}/txs?limit=8&offset=0`, network),
        );
        rows.push(
          ...txPage.transactions.map((tx) => ({
            ...tx,
            block_height: block.height,
            block_hash: block.hash,
          })),
        );
      } catch (error) {
        warning = errorMessage(error, "Some transaction summaries could not be resolved.");
      }
    }
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet is not connected yet"
          message="This deployment needs a testnet Bitcoin RPC endpoint before testnet transactions can be explored."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Transactions not available"
        message={errorMessage(error, "The provider could not return recent transactions.")}
        network={network}
      />
    );
  }

  rows = rows.slice(0, 24);

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link href={networkHref("/", network)} className="back-link">
            <MaterialIcon name="chevron_left" />
            Explorer
          </Link>
          <div className="mt-5">
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              Recent transactions
            </h1>
            <p className="mt-3 max-w-2xl text-[var(--muted)]">
              Latest decoded transactions from {networkLabel(network)} blocks.
            </p>
          </div>
        </header>

        <section className="panel detail-panel mt-6 reveal-panel reveal-delay-1">
          <div className="panel-heading detail-panel-heading">
            <div>
              <h2 className="text-xl font-semibold">Transactions</h2>
              <span>{rows.length} recent summaries</span>
            </div>
          </div>
          {warning ? (
            <div className="provider-note">
              <MaterialIcon name="info" />
              <p>{warning}</p>
            </div>
          ) : null}
          <div className="tx-list">
            {rows.map((tx) => (
              <article key={`${tx.block_hash}:${tx.txid}`} className="tx-row tx-card-row">
                <Link
                  href={networkHref(`/tx/${tx.txid}?block_hash=${tx.block_hash}`, network)}
                  className="tx-main transactions-main"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Txid</p>
                    <p className="txid-full mt-1 font-mono text-sm">{tx.txid}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Block</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      #{tx.block_height.toLocaleString("en-US")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Flow</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {tx.input_count} in / {tx.output_count} out
                    </p>
                  </div>
                  <div className="tx-value">
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Value</p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {formatBtcFromSats(tx.output_value_sat, network)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                      {formatFeeRate(tx.fee_rate_sat_vb)}
                    </p>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
