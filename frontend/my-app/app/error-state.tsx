import Link from "next/link";
import { NetworkKey, networkHref } from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import { AutoRetryRefresh, RetryNowButton } from "@/app/recovery-actions";
import SiteHeader from "@/app/site-header";

type ErrorStateProps = {
  title: string;
  message: string;
  eyebrow?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  network?: NetworkKey;
};

export default function ErrorState({
  title,
  message,
  eyebrow = "Lookup failed",
  primaryHref = "/",
  primaryLabel = "Back to explorer",
  secondaryHref,
  secondaryLabel,
  network = "mainnet",
}: ErrorStateProps) {
  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page">
        <div className="panel error-panel reveal-panel">
          <div className="error-icon" aria-hidden="true">
            <MaterialIcon name="warning" />
          </div>
          <p className="section-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{message}</p>
          <AutoRetryRefresh reason={`error:${title}`} showNotice />
          <div className="error-actions">
            <RetryNowButton />
            <Link href={networkHref(primaryHref, network)} className="outline-button">
              <MaterialIcon name="arrow_back" />
              {primaryLabel}
            </Link>
            {secondaryHref && secondaryLabel ? (
              <Link href={secondaryHref} className="outline-button">
                {secondaryLabel}
                <MaterialIcon name="arrow_forward" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
