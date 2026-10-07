import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ApiError,
  SearchResult,
  errorMessage,
  getJson,
  networkHref,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import SiteHeader from "@/app/site-header";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; network?: string }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const { q, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);
  const query = q?.trim();

  if (!query) {
    return (
      <SearchError
        message="Enter a block height, block hash, transaction id, or address."
        network={network}
      />
    );
  }

  let result: SearchResult;
  try {
    result = await getJson<SearchResult>(
      withNetwork(`/api/search?q=${encodeURIComponent(query)}`, network),
    );
  } catch (error) {
    // Addresses and txids are classified without touching the node, so a 5xx
    // here means the upstream itself failed rather than a provider limitation.
    const providerLimited = error instanceof ApiError && error.status >= 500;
    const message = providerLimited
      ? "The upstream provider failed while resolving that query. Please try again shortly."
      : errorMessage(
          error,
          "No block, transaction, or address matched that query. Check the height, hash, txid, or address and try again.",
        );
    return (
      <SearchError
        message={message}
        network={network}
      />
    );
  }

  if (result.type === "block") {
    redirect(networkHref(`/block/${result.height ?? result.hash}`, network));
  }
  if (result.type === "address") {
    redirect(networkHref(`/address/${result.address}`, network));
  }
  redirect(networkHref(`/tx/${result.txid}`, network));
}

function SearchError({ message, network = "mainnet" }: { message: string; network?: "mainnet" | "testnet" }) {
  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
          <h1 className="text-2xl font-semibold">Search not resolved</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
          <Link
            href={networkHref("/", network)}
            className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#08101e] transition hover:bg-[var(--accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            Back to explorer
          </Link>
        </div>
      </section>
    </main>
  );
}
