import ErrorState from "@/app/error-state";
import {
  Mempool,
  Tip,
  errorMessage,
  formatBytes,
  formatFeeRate,
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
  searchParams: Promise<{ network?: string }>;
};

export default async function MempoolPage({ searchParams }: PageProps) {
  const { network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);

  let mempool: Mempool;
  let tip: Tip;
  try {
    [mempool, tip] = await Promise.all([
      getJson<Mempool>(withNetwork("/api/mempool", network)),
      getJson<Tip>(withNetwork("/api/tip", network)),
    ]);
  } catch (error) {
    if (isNetworkUnavailable(error)) {
      return (
        <ErrorState
          eyebrow="Network unavailable"
          title="Testnet mempool is not connected yet"
          message="The mempool page is network-aware, but this deployment needs a testnet Bitcoin RPC endpoint before it can serve testnet data."
          primaryHref="/"
          primaryLabel="Open mainnet"
          network="mainnet"
        />
      );
    }
    return (
      <ErrorState
        title="Mempool not available"
        message={errorMessage(error, "The backend could not return mempool data right now.")}
        network={network}
      />
    );
  }

  const minRelaySatVb = mempool.min_fee_rate ? mempool.min_fee_rate * 100_000 : undefined;

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <a href={networkHref("/", network)} className="back-link">
            <MaterialIcon name="arrow_back" />
            Explorer
          </a>
          <div className="mt-5">
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
              {networkLabel(network)} mempool
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Live pending transaction pressure from the Rust API. Fee bands come from
              Bitcoin Core fee estimation when the provider exposes it.
            </p>
          </div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <section className="panel p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Metric icon="database" label="Pending txs" value={formatNumber(mempool.size)} />
              <Metric icon="inventory_2" label="Waiting bytes" value={formatBytes(mempool.bytes)} />
              <Metric icon="speed" label="Pressure" value={mempool.pressure ?? "normal"} />
            </div>

            <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Fee bands</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Estimate low, medium, and high confirmation urgency.
                  </p>
                </div>
                <span className="flow-chip">tip #{formatNumber(tip.height)}</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <FeeBand label="Low" value={formatFeeRate(mempool.fee_bands?.low_sat_vb)} target="~6 blocks" />
                <FeeBand label="Medium" value={formatFeeRate(mempool.fee_bands?.medium_sat_vb)} target="~3 blocks" />
                <FeeBand label="High" value={formatFeeRate(mempool.fee_bands?.high_sat_vb)} target="next block" />
              </div>
            </div>
          </section>

          <aside className="panel side-detail-panel">
            <h2 className="text-xl font-semibold">Provider snapshot</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail label="Network" value={networkLabel(network)} />
              <Detail label="Min relay fee" value={formatFeeRate(minRelaySatVb)} />
              <Detail label="Memory usage" value={formatBytes(mempool.usage)} />
              <Detail label="Best block" value={tip.hash} mono />
            </dl>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--accent)]">
        <MaterialIcon name={icon} />
      </div>
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-semibold">{value}</p>
    </div>
  );
}

function FeeBand({ label, value, target }: { label: string; value: string; target: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{target}</p>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-all text-[var(--text)] ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </dd>
    </div>
  );
}
