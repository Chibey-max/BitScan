import Link from "next/link";
import EntityLink from "@/app/entity-link";
import ErrorState from "@/app/error-state";
import {
  ReceiptDetail,
  errorMessage,
  formatBtcFromSats,
  formatNumber,
  formatTime,
  getJson,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ txid?: string; address?: string; block_hash?: string }>;
};

export default async function ReceiptPage({ searchParams }: PageProps) {
  const { txid, address, block_hash } = await searchParams;

  if (!txid || !address) {
    return (
      <main className="app-shell">
        <SiteHeader />
        <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
          <div className="panel p-6">
            <h1 className="text-2xl font-semibold">Create a payment receipt</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Open a transaction first, then choose an output address to generate
              a clean proof-of-payment receipt.
            </p>
            <Link href="/" className="outline-button mt-5">
              <MaterialIcon name="arrow_back" />
              Back to explorer
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const suffix = `${block_hash ? `&block_hash=${encodeURIComponent(block_hash)}` : ""}`;
  let receipt: ReceiptDetail;
  try {
    receipt = await getJson<ReceiptDetail>(
      `/api/receipt?txid=${encodeURIComponent(txid)}&address=${encodeURIComponent(address)}${suffix}`,
    );
  } catch (error) {
    return (
      <ErrorState
        title="Receipt not available"
        message={errorMessage(
          error,
          "The provider could not verify this receipt. Check the transaction/address pair or retry from the transaction page.",
        )}
        secondaryHref={`/tx/${txid}${block_hash ? `?block_hash=${block_hash}` : ""}`}
        secondaryLabel="Open transaction"
      />
    );
  }

  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="detail-page">
        <header className="detail-hero reveal-panel">
          <Link href={`/tx/${receipt.txid}${receipt.block_hash ? `?block_hash=${receipt.block_hash}` : ""}`} className="back-link">
            <MaterialIcon name="arrow_back" />
            Back to transaction
          </Link>
          <div className="mt-5">
            <p className="section-kicker">Payment receipt</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-5xl">
              {receipt.status === "confirmed" ? "Payment confirmed" : "Waiting for confirmation"}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">
              {formatBtcFromSats(receipt.amount_sat)} was received by this address.
            </p>
          </div>
        </header>

        <div className="grid gap-5 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)] reveal-panel reveal-delay-1">
          <section className="panel p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <ReceiptMetric label="Amount" value={formatBtcFromSats(receipt.amount_sat)} />
              <ReceiptMetric label="Confirmations" value={formatNumber(receipt.confirmations)} />
              <ReceiptMetric label="Outputs" value={receipt.output_indices.join(", ")} />
            </div>
            <div className="mt-6 space-y-5">
              <ReceiptLine
                label="Address"
                value={receipt.address}
                href={`/address/${receipt.address}`}
              />
              <ReceiptLine
                label="Transaction"
                value={receipt.txid}
                href={`/tx/${receipt.txid}${receipt.block_hash ? `?block_hash=${receipt.block_hash}` : ""}`}
              />
              {receipt.block_hash ? (
                <ReceiptLine
                  label="Block"
                  value={receipt.block_hash}
                  href={`/block/${receipt.block_hash}`}
                />
              ) : null}
              {receipt.block_time ? (
                <ReceiptLine label="Block time" value={formatTime(receipt.block_time)} copy={false} />
              ) : null}
            </div>
          </section>

          <aside className="panel note-panel">
            <div className="flex items-start gap-3">
              <MaterialIcon name="verified" className="mt-1 text-[var(--accent)]" />
              <div>
                <h2 className="text-xl font-semibold">Confirmation guide</h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  One confirmation is usually enough for small payments, three
                  is common for medium payments, and six is the classic standard
                  for high-value settlement.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ReceiptMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <p className="eyebrow">{label}</p>
      <p className="mono mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ReceiptLine({
  label,
  value,
  href,
  copy = true,
}: {
  label: string;
  value: string;
  href?: string;
  copy?: boolean;
}) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <div className="mt-2 flex min-w-0 items-start gap-2">
        {href && copy ? (
          <EntityLink href={href} value={value} label={label.toLowerCase()} className="text-sm" />
        ) : (
          <p className="mono break-all text-sm">{value}</p>
        )}
      </div>
    </div>
  );
}
