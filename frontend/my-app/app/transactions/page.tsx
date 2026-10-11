import { Suspense } from "react";
import Link from "next/link";
import ErrorState from "@/app/error-state";
import Loading from "@/app/loading";
import {
  BlockTransactions,
  BlocksResponse,
  NetworkKey,
  REVALIDATE,
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

// Not `force-dynamic` — see the note in app/lib/explorer.ts on getJson.

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

  return (
    <Suspense key={network} fallback={<Loading />}>
      <RecentTransactions network={network} />
    </Suspense>
  );
}

// Testnet blocks are far busier per block and its provider is slower, so the
// page samples fewer blocks there. Mainnet keeps the wider sample.
const BLOCK_SAMPLE = { mainnet: 4, testnet: 2 } as const;
const TXS_PER_BLOCK = { mainnet: 8, testnet: 6 } as const;

async function RecentTransactions({ network }: { network: NetworkKey }) {
  const blockSample = BLOCK_SAMPLE[network];
  const txsPerBlock = TXS_PER_BLOCK[network];
  let rows: RecentTx[] = [];
  let warning: string | undefined;

  try {
    const blockPage = await getJson<BlocksResponse>(
      withNetwork(`/api/blocks?limit=${blockSample}`, network),
      REVALIDATE.live,
    );

    // One request per block, all in flight at once. Sequentially this was four
    // nested round trips on top of an already-sequential backend fan-out.
    // Each task reports its own failure rather than writing to a shared
    // variable, so a partial outage still renders the blocks that did resolve.
    const pages = await Promise.all(
      blockPage.blocks.map(async (block) => {
        try {
          const txPage = await getJson<BlockTransactions>(
            withNetwork(
              `/api/block/${block.hash}/txs?limit=${txsPerBlock}&offset=0`,
              network,
            ),
            REVALIDATE.immutable,
          );
          return {
            rows: txPage.transactions.map((tx) => ({
              ...tx,
              block_height: block.height,
              block_hash: block.hash,
            })),
            error: undefined as string | undefined,
          };
        } catch (error) {
          return {
            rows: [] as RecentTx[],
            error: errorMessage(error, "Some transaction summaries could not be resolved."),
          };
        }
      }),
    );
    rows = pages.flatMap((page) => page.rows);
    warning = pages.find((page) => page.error)?.error;
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
