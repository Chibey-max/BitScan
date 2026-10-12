import { Suspense } from "react";
import ExplorerHome from "@/app/explorer-home";
import {
  BlockSummary,
  BlocksResponse,
  Mempool,
  NetworkKey,
  REVALIDATE,
  Tip,
  getJson,
  isNetworkUnavailable,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import ErrorState from "@/app/error-state";
import Loading from "@/app/loading";

// Deliberately NOT `force-dynamic`: that rewrites every fetch to `no-store`
// and defeats the data cache. Awaiting `searchParams` already makes this page
// render per request.

const demoTip: Tip = {
  height: 969_024,
  hash: "00000000000000000001e181f1a1103733d064de4e8b4c6e65fd846ca77f842a",
  chain: "main",
};

const demoMempool: Mempool = {
  size: 4_225,
  bytes: 1_458_838,
  min_fee_rate: 0.00001,
};

const demoBlocks: BlockSummary[] = [
  {
    height: 969_024,
    hash: "00000000000000000001e181f1a1103733d064de4e8b4c6e65fd846ca77f842a",
    timestamp: 1_790_612_931,
    tx_count: 4_298,
  },
  {
    height: 969_023,
    hash: "0000000000000000000188bc83e26426aaf21c9f47a8b6a6d679a35c6f0f3b01",
    timestamp: 1_790_612_144,
    tx_count: 2_913,
  },
  {
    height: 969_022,
    hash: "00000000000000000000ed1257d8d17c33f8514264cf787104191ce7bd11f246",
    timestamp: 1_790_611_602,
    tx_count: 3_624,
  },
  {
    height: 969_021,
    hash: "00000000000000000000c83c925a85be511de3ebafad2f2fbdf7f760d26cc01d",
    timestamp: 1_790_610_880,
    tx_count: 2_541,
  },
];

type PageProps = {
  searchParams: Promise<{ from_height?: string; network?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { from_height, network: networkParam } = await searchParams;
  const network = normalizeNetwork(networkParam);
  const fromHeight = from_height && /^\d+$/.test(from_height) ? Number(from_height) : undefined;

  // The shell and skeleton stream immediately; the panels arrive when the API
  // answers, instead of the browser waiting on a blank response.
  return (
    <Suspense key={`${network}:${fromHeight ?? "tip"}`} fallback={<Loading />}>
      <HomePanels network={network} fromHeight={fromHeight} />
    </Suspense>
  );
}

async function HomePanels({
  network,
  fromHeight,
}: {
  network: NetworkKey;
  fromHeight?: number;
}) {
  let state: "live" | "demo" = "demo";
  let tip = demoTip;
  let mempool = demoMempool;
  let blocks = demoBlocks;
  let nextFromHeight: number | undefined;

  const [tipResult, mempoolResult, blocksResult] = await Promise.allSettled([
    getJson<Tip>(withNetwork("/api/tip", network), REVALIDATE.live, 6_000),
    getJson<Mempool>(withNetwork("/api/mempool", network), REVALIDATE.live, 6_000),
    getJson<BlocksResponse>(
      withNetwork(
        `/api/blocks?limit=8${fromHeight === undefined ? "" : `&from_height=${fromHeight}`}`,
        network,
      ),
      REVALIDATE.live,
      10_000,
    ),
  ]);

  const failures = [tipResult, mempoolResult, blocksResult].filter(
    (result) => result.status === "rejected",
  );
  const hasAnyLiveData =
    tipResult.status === "fulfilled" ||
    mempoolResult.status === "fulfilled" ||
    blocksResult.status === "fulfilled";

  if (!hasAnyLiveData && failures.some((result) => isNetworkUnavailable(result.reason))) {
    return (
      <ErrorState
        eyebrow="Network unavailable"
        title="Testnet is not connected yet"
        message="BitScan understands testnet routes, but this deployment still needs a testnet Bitcoin RPC endpoint before it can serve testnet data."
        primaryHref="/"
        primaryLabel="Open mainnet"
        network="mainnet"
      />
    );
  }

  if (hasAnyLiveData) {
    state = "live";

    if (tipResult.status === "fulfilled") {
      tip = tipResult.value;
    }

    if (mempoolResult.status === "fulfilled") {
      mempool = mempoolResult.value;
    }

    if (blocksResult.status === "fulfilled") {
      blocks = blocksResult.value.blocks;
      nextFromHeight = blocksResult.value.next_from_height;
    } else if (tipResult.status === "fulfilled") {
      blocks = [];
    }
  } else {
    state = "demo";
  }

  return (
    <ExplorerHome
      state={state}
      tip={tip}
      mempool={mempool}
      blocks={blocks}
      fromHeight={fromHeight}
      nextFromHeight={nextFromHeight}
      network={network}
    />
  );
}
