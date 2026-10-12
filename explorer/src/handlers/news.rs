use std::{
    collections::{HashSet, hash_map::DefaultHasher},
    hash::{Hash, Hasher},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    Json,
    extract::{Query, State},
};
use futures::future::join_all;
use reqwest::Client;

use crate::{
    AppState,
    error::AppError,
    model::{NewsArticle, NewsQuery, NewsResponse},
};

const NEWS_TTL: Duration = Duration::from_secs(10 * 60);

struct NewsSource {
    name: &'static str,
    url: &'static str,
}

const SOURCES: &[NewsSource] = &[
    NewsSource {
        name: "CoinDesk",
        url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    },
    NewsSource {
        name: "Cointelegraph",
        url: "https://cointelegraph.com/rss/tag/bitcoin",
    },
    NewsSource {
        name: "Bitcoin Magazine",
        url: "https://bitcoinmagazine.com/.rss/full/",
    },
    NewsSource {
        name: "Bitcoin Optech",
        url: "https://bitcoinops.org/feed.xml",
    },
    NewsSource {
        name: "CryptoSlate",
        url: "https://cryptoslate.com/news/bitcoin/feed/",
    },
];

pub async fn news(
    State(state): State<AppState>,
    Query(query): Query<NewsQuery>,
) -> Result<Json<NewsResponse>, AppError> {
    let limit = query.limit.unwrap_or(24).clamp(1, 48);
    let category = query
        .category
        .as_deref()
        .map(normalize_filter)
        .filter(|value| value != "all");
    let search = query.q.as_deref().map(normalize_filter);
    let cache_key = format!(
        "news:v1:{}:{}:{}",
        category.as_deref().unwrap_or("all"),
        search.as_deref().unwrap_or(""),
        limit
    );

    if let Some(cache) = &state.cache {
        if let Some(mut response) = cache.fresh::<NewsResponse>(&cache_key).await {
            response.cached = true;
            return Ok(Json(response));
        }
    }

    match fetch_news(limit, category.as_deref(), search.as_deref()).await {
        Ok(response) => {
            if let Some(cache) = &state.cache {
                cache
                    .insert(&cache_key, "news-rss", NEWS_TTL, &response)
                    .await;
            }
            Ok(Json(response))
        }
        Err(error) => {
            if let Some(cache) = &state.cache {
                if let Some(mut response) = cache.stale::<NewsResponse>(&cache_key).await {
                    response.cached = true;
                    return Ok(Json(response));
                }
            }
            Err(error)
        }
    }
}

async fn fetch_news(
    limit: usize,
    category: Option<&str>,
    search: Option<&str>,
) -> Result<NewsResponse, AppError> {
    let client = Client::builder()
        .user_agent("BitScan/1.0 (+https://bitscan-app.vercel.app)")
        .timeout(Duration::from_secs(8))
        .build()?;

    let tasks = SOURCES.iter().map(|source| fetch_source(&client, source));
    let results = join_all(tasks).await;
    let mut articles = Vec::new();
    let mut sources = Vec::new();
    let mut seen = HashSet::new();

    for result in results {
        match result {
            Ok((source, mut items)) => {
                sources.push(source.to_owned());
                articles.append(&mut items);
            }
            Err(error) => {
                tracing::warn!(%error, "news source failed");
            }
        }
    }

    articles.retain(|article| {
        if !seen.insert(article.url.clone()) {
            return false;
        }
        if let Some(category) = category {
            if article.category != category {
                return false;
            }
        }
        if let Some(search) = search {
            article_matches(article, search)
        } else {
            true
        }
    });

    if articles.is_empty() {
        return Err(AppError::Rpc(
            "news providers returned no usable Bitcoin stories".into(),
        ));
    }

    articles.truncate(limit);
    Ok(NewsResponse {
        articles,
        sources,
        cached: false,
        updated_at: unix_now(),
    })
}

async fn fetch_source(
    client: &Client,
    source: &NewsSource,
) -> Result<(&'static str, Vec<NewsArticle>), AppError> {
    let xml = client
        .get(source.url)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    Ok((source.name, parse_feed(source.name, &xml)))
}

fn parse_feed(source: &str, xml: &str) -> Vec<NewsArticle> {
    let document = match roxmltree::Document::parse(xml) {
        Ok(document) => document,
        Err(error) => {
            tracing::warn!(%source, %error, "failed to parse news feed");
            return Vec::new();
        }
    };

    let mut articles = Vec::new();
    for item in document.descendants().filter(|node| {
        let name = node.tag_name().name();
        name == "item" || name == "entry"
    }) {
        let title = child_text(item, "title").map(clean_text);
        let url = child_text(item, "link")
            .or_else(|| {
                item.children()
                    .find(|child| child.is_element() && child.tag_name().name() == "link")
                    .and_then(|child| child.attribute("href").map(ToOwned::to_owned))
            })
            .map(clean_text);

        let (title, url) = match (title, url) {
            (Some(title), Some(url)) if !title.is_empty() && url.starts_with("http") => {
                (title, url)
            }
            _ => continue,
        };

        let summary = child_text(item, "description")
            .or_else(|| child_text(item, "summary"))
            .or_else(|| child_text(item, "content"))
            .map(clean_text)
            .filter(|value| !value.is_empty());
        let published_at = child_text(item, "pubDate")
            .or_else(|| child_text(item, "updated"))
            .or_else(|| child_text(item, "published"))
            .map(clean_text)
            .filter(|value| !value.is_empty());
        let tags = item
            .children()
            .filter(|child| child.is_element() && child.tag_name().name() == "category")
            .filter_map(|child| child.text().map(clean_text))
            .filter(|tag| !tag.is_empty())
            .take(5)
            .collect::<Vec<_>>();
        let category = classify_article(&title, summary.as_deref(), &tags);

        articles.push(NewsArticle {
            id: stable_id(&url),
            title,
            url,
            source: source.to_owned(),
            published_at,
            summary,
            category,
            tags,
        });
    }

    articles
}

fn child_text(node: roxmltree::Node<'_, '_>, child_name: &str) -> Option<String> {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name() == child_name)
        .and_then(|child| child.text())
        .map(ToOwned::to_owned)
}

fn classify_article(title: &str, summary: Option<&str>, tags: &[String]) -> String {
    let haystack = format!(
        "{} {} {}",
        title,
        summary.unwrap_or_default(),
        tags.join(" ")
    )
    .to_ascii_lowercase();

    let category = if contains_any(&haystack, &["mining", "miner", "hashrate", "hash rate"]) {
        "mining"
    } else if contains_any(
        &haystack,
        &["etf", "price", "market", "trading", "treasury"],
    ) {
        "markets"
    } else if contains_any(
        &haystack,
        &["law", "regulation", "senate", "sec", "policy", "court"],
    ) {
        "policy"
    } else if contains_any(
        &haystack,
        &[
            "lightning",
            "taproot",
            "wallet",
            "protocol",
            "core",
            "op_cat",
        ],
    ) {
        "protocol"
    } else if contains_any(&haystack, &["hack", "exploit", "security", "malware"]) {
        "security"
    } else {
        "bitcoin"
    };

    category.to_owned()
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn article_matches(article: &NewsArticle, search: &str) -> bool {
    [
        article.title.as_str(),
        article.summary.as_deref().unwrap_or_default(),
        article.source.as_str(),
        article.category.as_str(),
        &article.tags.join(" "),
    ]
    .iter()
    .any(|value| value.to_ascii_lowercase().contains(search))
}

fn normalize_filter(value: &str) -> String {
    value.trim().to_ascii_lowercase().replace(' ', "-")
}

fn clean_text(value: impl AsRef<str>) -> String {
    let value = value.as_ref();
    let mut output = String::with_capacity(value.len());
    let mut in_tag = false;
    for character in value.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(character),
            _ => {}
        }
    }

    output
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn stable_id(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
