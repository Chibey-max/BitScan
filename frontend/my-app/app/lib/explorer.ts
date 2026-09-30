export type Tip = {
  height: number;
  hash: string;
  chain?: string;
  verification_progress?: number;
};

export type Mempool = {
  size: number;
  bytes: number;
  min_fee_rate?: number;
};

export type BlockSummary = {
  height: number;
  hash: string;
  timestamp: number;
  tx_count: number;
  size?: number;
  weight?: number;
  total_fees_sat?: number;
};

export type BlocksResponse = {
  blocks: BlockSummary[];
  next_from_height?: number;
};

export type BlockDetail = BlockSummary & {
  previous_block_hash?: string;
  next_block_hash?: string;
  confirmations?: number;
  merkleroot: string;
  nonce: number;
  bits: string;
  difficulty: number;
  txids: string[];
};

export type TxSummary = {
  txid: string;
  fee_sat?: number;
  input_count: number;
  output_count: number;
  output_value_sat: number;
};

export type BlockTransactions = {
  block: BlockSummary;
  total: number;
  offset: number;
  limit: number;
  transactions: TxSummary[];
};

export type TxOutput = {
  n: number;
  value_sat: number;
  script_type?: string;
  address?: string;
};

export type TxInput = {
  txid?: string;
  vout?: number;
  coinbase?: string;
  sequence?: number;
  previous_output?: TxOutput;
};

export type TransactionDetail = {
  txid: string;
  hash: string;
  size?: number;
  vsize?: number;
  weight?: number;
  version?: number;
  locktime?: number;
  blockhash?: string;
  confirmations?: number;
  fee_sat?: number;
  inputs: TxInput[];
  outputs: TxOutput[];
};

export type SearchResult =
  | { type: "block"; hash: string; height?: number }
  | { type: "tx"; txid: string };

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return response.json();
}

export function compactHash(value: string, lead = 10, tail = 8) {
  if (value.length <= lead + tail + 3) return value;
  return `${value.slice(0, lead)}...${value.slice(-tail)}`;
}

export function classifyQuery(value: string) {
  const query = value.trim();
  if (!query) return "height, hash, txid, address";
  if (/^\d+$/.test(query)) return "block height";
  if (/^[a-fA-F0-9]{64}$/.test(query)) return "block hash or txid";
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{24,}$/i.test(query)) return "bitcoin address";
  return "search query";
}

export function blockFullnessPercent(weight?: number) {
  if (weight === undefined || weight === null) return undefined;
  return Math.min(100, Math.max(0, (weight / 4_000_000) * 100));
}

export function formatNumber(value?: number) {
  if (value === undefined || value === null) return "pending";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatBytes(value?: number) {
  if (value === undefined || value === null) return "pending";
  return new Intl.NumberFormat("en-US", {
    notation: value > 999_999 ? "compact" : "standard",
  }).format(value);
}

export function formatBtcFromSats(value?: number) {
  if (value === undefined || value === null) return "pending";
  return `${(value / 100_000_000).toFixed(8)} BTC`;
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatRelativeBlockTime(timestamp: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp * 1000) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatTime(timestamp);
}
