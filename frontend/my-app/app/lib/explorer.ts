export type Tip = {
  network?: NetworkKey;
  height: number;
  hash: string;
  chain?: string;
  verification_progress?: number;
};

export type Mempool = {
  network?: NetworkKey;
  size: number;
  bytes: number;
  usage?: number;
  min_fee_rate?: number;
  pressure?: string;
  fee_bands?: FeeBands;
};

export type FeeBands = {
  low_sat_vb?: number;
  medium_sat_vb?: number;
  high_sat_vb?: number;
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
  network?: NetworkKey;
  blocks: BlockSummary[];
  next_from_height?: number;
};

export type BlockDetail = BlockSummary & {
  network?: NetworkKey;
  previous_block_hash?: string;
  next_block_hash?: string;
  time_since_previous_block_seconds?: number;
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
  fee_rate_sat_vb?: number;
  input_count: number;
  output_count: number;
  output_value_sat: number;
  script_types?: string[];
};

export type BlockTransactions = {
  network?: NetworkKey;
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
  script_asm?: string;
  script_hex?: string;
  decoded_op_return?: string;
  address?: string;
  spent?: boolean;
};

export type TxInput = {
  txid?: string;
  vout?: number;
  coinbase?: string;
  sequence?: number;
  previous_output?: TxOutput;
};

export type TransactionDetail = {
  network?: NetworkKey;
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
  fee_rate_sat_vb?: number;
  fee_grade?: FeeGrade;
  summary?: TxInsight;
  inputs?: TxInput[];
  outputs?: TxOutput[];
  fee_report?: FeeReport;
};

export type FeeGrade = {
  grade: string;
  verdict: string;
  target_blocks?: number;
};

export type TxInsight = {
  is_coinbase: boolean;
  has_op_return: boolean;
  input_total_sat?: number;
  output_total_sat: number;
  script_types: string[];
  explanation: string;
};

export type FeeReport = {
  grade: string;
  fee_rate_sat_vb: number;
  percentile?: number | null;
  verdict: string;
  savings_vs_median_sat?: number;
  savings_vs_min_sat?: number;
  min_fee_rate_sat_vb?: number;
  avg_fee_rate_sat_vb?: number;
  max_fee_rate_sat_vb?: number;
  percentiles_sat_vb: number[];
};

export type AddressTransaction = {
  txid: string;
  block_height?: number;
  timestamp?: number;
  fee_sat?: number;
  // Sum of this transaction's outputs paying the address.
  received_sat: number;
  spends_from_address: boolean;
  // What this address spent in the transaction. Only the local index can
  // answer this (the provider returns input addresses as null), so it is
  // absent for transactions outside the indexed window.
  sent_sat?: number | null;
};

// Mirrors the Rust `AddressResponse`: totals from the address indexer's balance
// endpoint, history from its per-address transaction endpoint.
export type AddressDetail = {
  network?: NetworkKey;
  address: string;
  is_valid: boolean;
  address_type?: string;
  balance_sat: number;
  received_sat: number;
  sent_sat: number;
  pending_balance_sat: number;
  // False when the totals cover only a recent window rather than the address's
  // whole history — the local fallback indexer keeps just the last N blocks.
  totals_complete: boolean;
  offset: number;
  limit: number;
  transactions: AddressTransaction[];
  source: string;
};

export type SearchResult =
  | { type: "block"; hash: string; height?: number }
  | { type: "tx"; txid: string }
  | { type: "address"; address: string };

export type NewsArticle = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at?: string;
  summary?: string;
  category: string;
  tags: string[];
};

export type NewsResponse = {
  articles: NewsArticle[];
  sources: string[];
  cached: boolean;
  updated_at: number;
};

export type AiResource = {
  title: string;
  url: string;
};

export type AiChatResponse = {
  answer: string;
  model: string;
  provider: string;
  key_index: number;
  resources: AiResource[];
};

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export type NetworkKey = "mainnet" | "testnet";

export function normalizeNetwork(value?: string): NetworkKey {
  return value === "testnet" ? "testnet" : "mainnet";
}

export function networkLabel(network: NetworkKey) {
  return network === "testnet" ? "Testnet" : "Mainnet";
}

export function networkQuery(network: NetworkKey) {
  return network === "testnet" ? "network=testnet" : "";
}

export function withNetwork(path: string, network: NetworkKey) {
  if (network === "mainnet") return path;
  return `${path}${path.includes("?") ? "&" : "?"}${networkQuery(network)}`;
}

export function networkHref(path: string, network: NetworkKey) {
  if (network === "mainnet") return path;
  const hashIndex = path.indexOf("#");
  if (hashIndex !== -1) {
    const base = path.slice(0, hashIndex) || "/";
    const hash = path.slice(hashIndex);
    return `${withNetwork(base, network)}${hash}`;
  }
  return withNetwork(path, network);
}

export function networkSource(network: NetworkKey) {
  return network === "testnet"
    ? "bitcoin-testnet.gateway.tatum.io"
    : "bitrpc.thebuidl.xyz";
}

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(status: number, detail?: string) {
    super(detail || `API returned ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Seconds of staleness allowed per request. Next's data cache is keyed on the
 * URL, so repeat navigation to the same view is served without touching the
 * API at all. Chain data only changes every ~10 minutes, so a few seconds is
 * invisible — and the pages must NOT set `dynamic = "force-dynamic"`, which
 * silently rewrites every fetch to `no-store` and defeats this.
 */
export const REVALIDATE = {
  /** Tip height and mempool: visibly live, so keep it short. */
  live: 10,
  /** Confirmed blocks and transactions are immutable once buried. */
  immutable: 300,
  /** Address balances move whenever a new block lands. */
  address: 30,
  /** News aggregation is cached by the API and can stay calm between reads. */
  news: 600,
} as const;

export async function getJson<T>(
  path: string,
  revalidate: number = REVALIDATE.live,
  timeoutMs: number = 8_000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { accept: "application/json" },
      next: { revalidate },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const payload = await response.json();
      detail = typeof payload?.error === "string" ? payload.error : undefined;
    } catch {
      detail = response.statusText || undefined;
    }
    throw new ApiError(response.status, detail);
  }

  return response.json();
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 400) return error.detail || "That request was not valid.";
    if (error.status === 404) return error.detail || "That record was not found.";
    if (error.status === 429) return "The provider is rate limiting requests. Please wait a moment and try again.";
    if (error.status >= 500) {
      return "The Bitcoin data provider returned an upstream error while resolving this request.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isNetworkUnavailable(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    typeof error.detail === "string" &&
    error.detail.includes("testnet is not configured")
  );
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

export function formatBlockInterval(seconds?: number) {
  if (seconds === undefined || seconds === null) return "pending";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function coinUnit(network: NetworkKey = "mainnet") {
  return network === "testnet" ? "tBTC" : "BTC";
}

export function formatBtcFromSats(value?: number, network: NetworkKey = "mainnet") {
  if (value === undefined || value === null) return "pending";
  return `${(value / 100_000_000).toFixed(8)} ${coinUnit(network)}`;
}

export function formatFeeRate(value?: number) {
  if (value === undefined || value === null || Number.isNaN(value)) return "pending";
  return `${value.toFixed(value >= 10 ? 1 : 2)} sat/vB`;
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp * 1000));
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function formatDurationWords(seconds: number) {
  if (seconds < 60) return plural(seconds, "second");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.floor(hours / 24);
  return plural(days, "day");
}

function formatDurationShort(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatBlockAge(timestamp: number) {
  const then = new Date(timestamp * 1000);
  const now = new Date();
  const rawSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (rawSeconds < 0) return `${formatDurationWords(Math.abs(rawSeconds))} ahead`;
  const seconds = Math.max(0, rawSeconds);

  if (seconds < 60) return plural(seconds, "second") + " ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute") + " ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour") + " ago";
  const days = Math.floor(hours / 24);
  if (days < 31) return plural(days, "day") + " ago";

  let years = now.getFullYear() - then.getFullYear();
  let months = now.getMonth() - then.getMonth();
  if (now.getDate() < then.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 0) {
    return months > 0
      ? `${plural(years, "year")} ${plural(months, "month")} ago`
      : `${plural(years, "year")} ago`;
  }
  return `${plural(Math.max(1, months), "month")} ago`;
}

export function formatRelativeBlockTime(timestamp: number, nowMs = Date.now()) {
  const rawSeconds = Math.floor((nowMs - timestamp * 1000) / 1000);
  if (rawSeconds < 0) return `${formatDurationShort(Math.abs(rawSeconds))} ahead`;
  const seconds = Math.max(0, rawSeconds);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatTime(timestamp);
}
