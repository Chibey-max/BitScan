import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchResult, getJson } from "@/app/lib/explorer";
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
  } catch {
    return (
      <SearchError message="No block matched that query. BitRPC txid lookup needs the containing block hash, so open the block first when inspecting old transactions." />
    );
  }

  if (result.type === "block") {
    redirect(`/block/${result.height ?? result.hash}`);
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
