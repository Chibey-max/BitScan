export type Tip = {
  height: number;
  hash: string;
  chain?: string;
  verification_progress?: number;
};

export type Mempool = {
  size?: number;
  bytes?: number;
  min_fee_rate?: number;
};

export type BlockSummary = {
  height: number;
  hash: string;
  timestamp?: number;
  tx_count?: number;
  size?: number;
  weight?: number;
  total_fees_sat?: number;
};

export type BlocksResponse = {
  blocks?: BlockSummary[];
  next_from_height?: number;
};

export type BlockDetail = BlockSummary & {
  previous_block_hash?: string;
  next_block_hash?: string;
  confirmations?: number;
  merkleroot?: string;
  nonce?: number;
  bits?: string;
  difficulty?: number;
  txids?: string[];
};

export type TxSummary = {
  txid: string;
  fee_sat?: number;
  input_count?: number;
  output_count?: number;
  output_value_sat?: number;
};

export type BlockTransactions = {
  block: BlockSummary;
  total?: number;
  offset?: number;
  limit?: number;
  transactions?: TxSummary[];
};

export type TxOutput = {
  n: number;
  value_sat: number;
  script_type?: string;
  address?: string;
  op_return_text?: string;
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
  hex?: string;
  size?: number;
  vsize?: number;
  weight?: number;
  version?: number;
  locktime?: number;
  blockhash?: string;
  confirmations?: number;
  fee_sat?: number;
  inputs?: TxInput[];
  outputs?: TxOutput[];
  story?: Story;
  fee_report?: FeeReport;
};

type TxStatus = {
  confirmed?: boolean;
  block_hash?: string;
};

export type Story = {
  kind: string;
  headline: string;
  sentences: string[];
  change_output?: number;
  confidence: string;
  tags: string[];
};

export type FeeReport = {
  grade?: string;
  fee_rate_sat_vb?: number;
  percentile?: number | null;
  verdict?: string;
  savings_vs_median_sat?: number;
  savings_vs_min_sat?: number;
  min_fee_rate_sat_vb?: number;
  avg_fee_rate_sat_vb?: number;
  max_fee_rate_sat_vb?: number;
  percentiles_sat_vb?: number[];
};

export type ReceiptDetail = {
  txid: string;
  address: string;
  amount_sat?: number;
  output_indices?: number[];
  status: string;
  confirmations?: number;
  block_hash?: string;
  block_time?: number;
  generated_at: number;
};

export type BlockMessages = {
  block_hash: string;
  height: number;
  coinbase_tag?: string;
  messages: Array<{
    txid: string;
    output_index?: number;
    kind: string;
    text: string;
  }>;
};

export type AddressTransaction = {
  txid: string;
  block_height?: number;
  timestamp?: number;
  fee_sat?: number;
  received_sat?: number;
  sent_sat?: number;
  net_sat?: number;
};

export type AddressDetail = {
  address: string;
  is_valid?: boolean;
  script_pub_key?: string;
  balance_sat?: number;
  received_sat?: number;
  sent_sat?: number;
  pending_balance_sat?: number;
  tx_count?: number;
  utxo_count?: number;
  utxos: Array<{
    txid: string;
    vout: number;
    height?: number;
    value_sat: number;
  }>;
  transactions?: AddressTransaction[];
  source?: string;
};

export type SearchResult =
  | { type: "block"; hash: string; height?: number }
  | { type: "tx"; txid: string }
  | { type: "address"; address: string };

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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

type GetJsonOptions = {
  revalidate?: number;
  timeoutMs?: number;
};

export async function getJson<T>(
  path: string,
  { revalidate = 30, timeoutMs = 12_000 }: GetJsonOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { accept: "application/json" },
    signal: controller.signal,
  };

  if (revalidate > 0) {
    init.next = { revalidate };
  } else {
    init.cache = "no-store";
  }

  const response = await fetch(`${API_BASE}${path}`, init).finally(() => {
    clearTimeout(timeout);
  });

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

export async function resolveTxBlockHash(txid: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(txid)) return undefined;

  const statusUrls = [
    `https://mempool.space/api/tx/${encodeURIComponent(txid)}/status`,
    `https://blockstream.info/api/tx/${encodeURIComponent(txid)}/status`,
  ];

  for (const url of statusUrls) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate: 3_600 },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const status = (await response.json()) as TxStatus;
      if (status.confirmed && status.block_hash) return status.block_hash;
    } catch {
      continue;
    }
  }

  return undefined;
}

export async function getTransactionDetail(
  txid: string,
  blockHash?: string,
): Promise<TransactionDetail> {
  const encodedTxid = encodeURIComponent(txid);
  const suffix = blockHash
    ? `?block_hash=${encodeURIComponent(blockHash)}`
    : "";

  try {
    return await getJson<TransactionDetail>(`/api/tx/${encodedTxid}${suffix}`, {
      revalidate: blockHash ? 300 : 20,
    });
  } catch (error) {
    const resolvedBlockHash = await resolveTxBlockHash(txid);
    if (!resolvedBlockHash || resolvedBlockHash === blockHash) throw error;
    return getJson<TransactionDetail>(
      `/api/tx/${encodedTxid}?block_hash=${encodeURIComponent(resolvedBlockHash)}`,
      { revalidate: 300 },
    );
  }
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

export function compactHash(value?: string, lead = 10, tail = 8) {
  if (!value) return "pending";
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

export function formatTime(timestamp?: number) {
  if (timestamp === undefined || timestamp === null) return "pending";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

export function formatBlockAge(timestamp?: number) {
  if (timestamp === undefined || timestamp === null) return "pending";
  const then = new Date(timestamp * 1000);
  const now = new Date();
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));

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

export function formatRelativeBlockTime(timestamp?: number) {
  if (timestamp === undefined || timestamp === null) return "pending";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp * 1000) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatTime(timestamp);
}
