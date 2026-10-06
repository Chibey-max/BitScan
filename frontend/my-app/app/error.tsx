"use client";

import Link from "next/link";
import MaterialIcon from "@/app/material-icon";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-shell">
      <section className="detail-page">
        <div className="panel error-panel">
          <div className="error-icon" aria-hidden="true">
            <MaterialIcon name="warning" />
          </div>
          <p className="section-kicker">Application error</p>
          <h1>Something broke</h1>
          <p>
            BitScan hit an unexpected UI error. You can retry this view or
            return to the explorer.
          </p>
          {error.digest ? (
            <p className="mono text-xs">Digest {error.digest}</p>
          ) : null}
          <div className="error-actions">
            <button type="button" className="outline-button" onClick={reset}>
              <MaterialIcon name="refresh" />
              Try again
            </button>
            <Link href="/" className="outline-button">
              <MaterialIcon name="arrow_back" />
              Back to explorer
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
