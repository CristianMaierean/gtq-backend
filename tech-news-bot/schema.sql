-- PC Tech News Bot — PostgreSQL schema
-- Run once: psql "$DATABASE_URL" -f schema.sql

CREATE TABLE IF NOT EXISTS seen_products (
  id                SERIAL PRIMARY KEY,
  normalized_name   TEXT NOT NULL UNIQUE,   -- lowercased/trimmed product name used for dedup
  product_name      TEXT NOT NULL,          -- display name as first seen
  category          TEXT,                   -- GPU / CPU / Motherboard / Cooler / RAM / SSD / Case / Other
  status            TEXT NOT NULL DEFAULT 'candidate',
                     -- candidate -> confirmed -> published   (or -> rejected)
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidate_sightings (
  id                SERIAL PRIMARY KEY,
  seen_product_id   INTEGER NOT NULL REFERENCES seen_products(id) ON DELETE CASCADE,
  source_name       TEXT NOT NULL,          -- e.g. "Tom's Hardware"
  source_url        TEXT NOT NULL,
  title             TEXT NOT NULL,
  is_official        BOOLEAN NOT NULL DEFAULT false,
  is_rumor_source     BOOLEAN NOT NULL DEFAULT false,
  published_at      TIMESTAMPTZ,
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seen_product_id, source_url)
);

CREATE TABLE IF NOT EXISTS raw_headlines_seen (
  -- prevents re-classifying the same RSS item on every daily run
  id                SERIAL PRIMARY KEY,
  source_url        TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  classified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  was_hardware      BOOLEAN
);

CREATE TABLE IF NOT EXISTS articles (
  id                    SERIAL PRIMARY KEY,
  seen_product_id       INTEGER NOT NULL REFERENCES seen_products(id) ON DELETE CASCADE,
  shopify_article_id    BIGINT,
  shopify_blog_handle   TEXT,
  shopify_article_handle TEXT,
  title                 TEXT NOT NULL,
  seo_title             TEXT,
  seo_description       TEXT,
  internal_link_url     TEXT,
  source_citations      JSONB,              -- [{name, url}]
  published_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seen_products_status ON seen_products(status);
CREATE INDEX IF NOT EXISTS idx_sightings_product ON candidate_sightings(seen_product_id);
