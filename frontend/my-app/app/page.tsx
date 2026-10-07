import ExplorerHome from "@/app/explorer-home";
import {
  BlockSummary,
  BlocksResponse,
  Mempool,
  Tip,
  getJson,
  isNetworkUnavailable,
  normalizeNetwork,
  withNetwork,
} from "@/app/lib/explorer";
import ErrorState from "@/app/error-state";

export const dynamic = "force-dynamic";

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
  let state: "live" | "demo" = "demo";
  let tip = demoTip;
  let mempool = demoMempool;
  let blocks = demoBlocks;
  let nextFromHeight: number | undefined;

  try {
    const [nextTip, nextMempool, blockPage] = await Promise.all([
      getJson<Tip>(withNetwork("/api/tip", network)),
      getJson<Mempool>(withNetwork("/api/mempool", network)),
      getJson<BlocksResponse>(
        withNetwork(
          `/api/blocks?limit=8${fromHeight === undefined ? "" : `&from_height=${fromHeight}`}`,
          network,
        ),
      ),
    ]);
    state = "live";
    tip = nextTip;
    mempool = nextMempool;
    blocks = blockPage.blocks;
    nextFromHeight = blockPage.next_from_height;
  } catch (error) {
    if (isNetworkUnavailable(error)) {
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
