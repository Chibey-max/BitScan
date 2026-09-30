import SiteHeader from "@/app/site-header";

export default function Loading() {
  return (
    <main className="app-shell">
      <SiteHeader live={false} />
      <section className="dashboard-wrap explorer-stage">
        <div className="skeleton skeleton-command" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-large" />
          <div className="skeleton-stack">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
        <div className="skeleton skeleton-table" />
      </section>
    </main>
  );
}
