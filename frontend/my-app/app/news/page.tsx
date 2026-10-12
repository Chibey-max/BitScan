import Link from "next/link";
import { Suspense } from "react";
import ErrorState from "@/app/error-state";
import Loading from "@/app/loading";
import {
  NewsArticle,
  NewsResponse,
  REVALIDATE,
  errorMessage,
  getJson,
  networkHref,
  normalizeNetwork,
} from "@/app/lib/explorer";
import MaterialIcon from "@/app/material-icon";
import SiteHeader from "@/app/site-header";

type PageProps = {
  searchParams: Promise<{ network?: string; category?: string; q?: string }>;
};

const categories = ["all", "bitcoin", "markets", "protocol", "mining", "policy", "security"];

export default async function NewsPage({ searchParams }: PageProps) {
  const { network: networkParam, category, q } = await searchParams;
  const network = normalizeNetwork(networkParam);

  return (
    <Suspense fallback={<Loading />}>
      <NewsView network={network} category={category ?? "all"} query={q ?? ""} />
    </Suspense>
  );
}

async function NewsView({
  network,
  category,
  query,
}: {
  network: ReturnType<typeof normalizeNetwork>;
  category: string;
  query: string;
}) {
  let news: NewsResponse;
  const params = new URLSearchParams({ limit: "24" });
  if (category && category !== "all") params.set("category", category);
  if (query.trim()) params.set("q", query.trim());

  try {
    news = await getJson<NewsResponse>(`/api/news?${params.toString()}`, REVALIDATE.news);
  } catch (error) {
    return (
      <ErrorState
        eyebrow="News unavailable"
        title="Could not load the Bitcoin news desk"
        message={errorMessage(error, "The backend could not aggregate Bitcoin news right now.")}
        network={network}
      />
    );
  }

  const lead = news.articles[0];
  const rest = news.articles.slice(1);

  return (
    <main className="app-shell">
      <SiteHeader network={network} />
      <section className="detail-page news-page">
        <header className="news-hero reveal-panel">
          <div>
            <Link href={networkHref("/", network)} className="back-link">
              <MaterialIcon name="arrow_back" />
              Explorer
            </Link>
            <h1>Bitcoin news desk</h1>
            <p>
              A cached, source-aware feed of Bitcoin protocol, market, policy, and mining stories,
              resolved by the Rust API so the frontend stays fast and provider limits stay hidden.
            </p>
          </div>
          <div className="news-source-card">
            <span className="material-symbols-rounded" aria-hidden="true">
              rss_feed
            </span>
            <p>{news.cached ? "Served from cache" : "Fresh provider read"}</p>
            <strong>{news.sources.length} sources online</strong>
          </div>
        </header>

        <nav className="news-filter-bar" aria-label="News categories">
          {categories.map((item) => (
            <Link
              key={item}
              href={newsHref(item, query, network)}
              className={normalizeCategory(category) === item ? "news-filter-active" : undefined}
            >
              {item}
            </Link>
          ))}
        </nav>

        {lead ? (
          <section className="news-layout">
            <ArticleCard article={lead} featured />
            <div className="news-grid">
              {rest.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </section>
        ) : (
          <section className="panel news-empty">
            <MaterialIcon name="search_off" />
            <h2>No stories matched</h2>
            <p>Try another category or clear the search filter.</p>
          </section>
        )}
      </section>
    </main>
  );
}

function ArticleCard({ article, featured = false }: { article: NewsArticle; featured?: boolean }) {
  return (
    <article className={featured ? "news-card news-card-featured" : "news-card"}>
      <div className="news-card-top">
        <span className="news-category">{article.category}</span>
        <span>{article.source}</span>
      </div>
      <h2>
        <a href={article.url} target="_blank" rel="noreferrer">
          {article.title}
        </a>
      </h2>
      {article.summary ? <p>{article.summary}</p> : null}
      <div className="news-card-footer">
        <span>{article.published_at ?? "recent"}</span>
        <a href={article.url} target="_blank" rel="noreferrer" aria-label={`Open ${article.title}`}>
          <MaterialIcon name="open_in_new" />
        </a>
      </div>
    </article>
  );
}

function newsHref(category: string, query: string, network: ReturnType<typeof normalizeNetwork>) {
  const params = new URLSearchParams();
  if (network === "testnet") params.set("network", "testnet");
  if (category !== "all") params.set("category", category);
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString();
  return suffix ? `/news?${suffix}` : "/news";
}

function normalizeCategory(value?: string) {
  return value && categories.includes(value) ? value : "all";
}
