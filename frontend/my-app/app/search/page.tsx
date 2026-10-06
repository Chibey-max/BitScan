import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ApiError,
  SearchResult,
  errorMessage,
  getJson,
} from "@/app/lib/explorer";
import SiteHeader from "@/app/site-header";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim();

  if (!query) {
    return <SearchError message="Enter a block height or block hash." />;
  }

  let result: SearchResult;
  try {
    result = await getJson<SearchResult>(
      `/api/search?q=${encodeURIComponent(query)}`,
    );
  } catch (error) {
    const isTxid = /^[a-fA-F0-9]{64}$/.test(query);
    const isAddress = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{24,}$/i.test(query);
    const providerLimited = error instanceof ApiError && error.status >= 500;
    const message =
      providerLimited && isAddress
        ? "Address search is limited in the BitRPC-only build. The RPC provider rejected this request, so BitScan cannot show address history here."
        : providerLimited && isTxid
          ? "This txid could not be resolved by the current provider without block context. Open the containing block first, then select the transaction from that block."
          : errorMessage(
              error,
              "No block, transaction, or address matched that query. For older txids, open the containing block first so the request can include the block hash.",
            );
    return (
      <SearchError
        message={message}
      />
    );
  }

  if (result.type === "block") {
    redirect(`/block/${result.height ?? result.hash}`);
  }
  if (result.type === "address") {
    redirect(`/address/${result.address}`);
  }
  redirect(`/tx/${result.txid}`);
}

function SearchError({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
          <h1 className="text-2xl font-semibold">Search not resolved</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[#08101e] transition hover:bg-[var(--accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            Back to explorer
          </Link>
        </div>
      </section>
    </main>
  );
}
