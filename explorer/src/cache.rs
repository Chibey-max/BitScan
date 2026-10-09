use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::Duration;

pub struct PersistentCache {
    pool: PgPool,
}

impl PersistentCache {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        sqlx::query(
            r#"
            create table if not exists provider_cache (
                cache_key text primary key,
                provider text not null,
                payload jsonb not null,
                created_at timestamptz not null default now(),
                expires_at timestamptz not null,
                last_used_at timestamptz not null default now()
            )
            "#,
        )
        .execute(&pool)
        .await?;

        sqlx::query(
            r#"
            create index if not exists provider_cache_expires_at_idx
            on provider_cache (expires_at)
            "#,
        )
        .execute(&pool)
        .await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> PgPool {
        self.pool.clone()
    }

    pub async fn fresh<T>(&self, key: &str) -> Option<T>
    where
        T: DeserializeOwned,
    {
        self.read(key, true).await
    }

    pub async fn stale<T>(&self, key: &str) -> Option<T>
    where
        T: DeserializeOwned,
    {
        self.read(key, false).await
    }

    pub async fn insert<T>(&self, key: &str, provider: &str, ttl: Duration, value: &T)
    where
        T: Serialize,
    {
        let payload = match serde_json::to_value(value) {
            Ok(payload) => payload,
            Err(error) => {
                tracing::warn!(%key, %error, "failed to serialize provider cache payload");
                return;
            }
        };

        if let Err(error) = sqlx::query(
            r#"
            insert into provider_cache
                (cache_key, provider, payload, created_at, expires_at, last_used_at)
            values
                ($1, $2, $3, now(), now() + ($4::bigint * interval '1 second'), now())
            on conflict (cache_key) do update set
                provider = excluded.provider,
                payload = excluded.payload,
                created_at = now(),
                expires_at = excluded.expires_at,
                last_used_at = now()
            "#,
        )
        .bind(key)
        .bind(provider)
        .bind(payload)
        .bind(ttl.as_secs() as i64)
        .execute(&self.pool)
        .await
        {
            tracing::warn!(%key, %error, "failed to write provider cache");
        }
    }

    async fn read<T>(&self, key: &str, fresh_only: bool) -> Option<T>
    where
        T: DeserializeOwned,
    {
        let row = if fresh_only {
            sqlx::query_scalar::<_, Value>(
                r#"
                update provider_cache
                set last_used_at = now()
                where cache_key = $1 and expires_at > now()
                returning payload
                "#,
            )
            .bind(key)
            .fetch_optional(&self.pool)
            .await
        } else {
            sqlx::query_scalar::<_, Value>(
                r#"
                update provider_cache
                set last_used_at = now()
                where cache_key = $1
                returning payload
                "#,
            )
            .bind(key)
            .fetch_optional(&self.pool)
            .await
        };

        let payload = match row {
            Ok(payload) => payload?,
            Err(error) => {
                tracing::warn!(%key, %error, "failed to read provider cache");
                return None;
            }
        };

        match serde_json::from_value(payload) {
            Ok(value) => Some(value),
            Err(error) => {
                tracing::warn!(%key, %error, "failed to deserialize provider cache payload");
                None
            }
        }
    }
}
