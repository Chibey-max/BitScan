import Link from "next/link";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

type ErrorStateProps = {
  title: string;
  message: string;
  eyebrow?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

export default function ErrorState({
  title,
  message,
  eyebrow = "Lookup failed",
  primaryHref = "/",
  primaryLabel = "Back to explorer",
  secondaryHref,
  secondaryLabel,
}: ErrorStateProps) {
  return (
    <main className="app-shell">
      <SiteHeader />
      <section className="detail-page">
        <div className="panel error-panel reveal-panel">
          <div className="error-icon" aria-hidden="true">
            <MaterialIcon name="warning" />
          </div>
          <p className="section-kicker">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{message}</p>
          <div className="error-actions">
            <Link href={primaryHref} className="outline-button">
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
