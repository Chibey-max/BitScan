import Link from "next/link";
import AiChat from "@/app/ai/ai-chat";
import { normalizeNetwork, networkHref } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

type PageProps = {
  searchParams: Promise<{ network?: string }>;
};

export default async function AiPage({ searchParams }: PageProps) {
  const { network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page ai-page">
        <header className="detail-hero ai-hero reveal-panel">
          <Link href={networkHref("/", network)} className="back-link">
            <MaterialIcon name="arrow_back" />
            Explorer
          </Link>
          <div className="mt-5">
            <h1>BitScan AI mode</h1>
            <p>
              A Bitcoin-only assistant for learning blocks, transactions, scripts, fees, mining,
              wallets, and explorer data.
            </p>
          </div>
        </header>

        <AiChat />
      </section>
    </main>
  );
}
