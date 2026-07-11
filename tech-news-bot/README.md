# tech-news-bot

Daily bot that finds newly-announced PC hardware, cross-checks it across multiple
tech news outlets before treating it as real, writes a grounded blog post about
it, and publishes it to a dedicated blog on the GamerTech Shopify store.

## How it works

```
RSS feeds (Tom's Hardware, TechPowerUp, Guru3D, Wccftech, PCWorld, Ars Technica,
VideoCardz)
   │
   ▼
Claude Haiku 4.5 — cheap classifier
   "Is this headline a genuine new-hardware announcement?" (~$0.001/headline)
   │
   ▼
Postgres dedup + corroboration
   A candidate is only "confirmed" once 2+ independent outlets have covered it
   (VideoCardz alone never confirms — it's rumor-heavy, corroboration-only)
   │
   ▼
Article text fetch (Readability extraction) from up to 3 corroborating sources
   │
   ▼
Claude Sonnet 5 — grounded writer (~$0.04-0.05/article)
   Writes ONLY from the fetched source text. Cannot invent specs/prices/dates.
   Picks an internal GamerTech link from a fixed whitelist (never invents a URL).
   │
   ▼
Shopify Blog API — publishes to the "PC Tech News" blog, live immediately
```

Every step is idempotent and safe to re-run — headlines already classified,
candidates already confirmed, and products already published are skipped on
subsequent runs (tracked in Postgres).

## Setup

```bash
cd tech-news-bot
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY, DATABASE_URL, SHOPIFY_ADMIN_TOKEN
npm run setup-db       # applies schema.sql
npm start               # one manual run to confirm everything works
```

`SHOPIFY_ADMIN_TOKEN` needs `write_content` scope (to create blogs/articles).
It can be the same token used by the PC Parts upload scripts, or a separate one
scoped down to just blog access.

## Running on a schedule

### Option A — plain server cron

```cron
# Run once a day at 8am server time
0 8 * * * cd /path/to/tech-news-bot && /usr/bin/node src/index.js >> /var/log/tech-news-bot.log 2>&1
```

### Option B — Render, reusing an existing Postgres instance (this is what we're doing)

Render has a **Cron Job** service type built for exactly this — it spins up,
runs the script once on schedule, and shuts down (no server to keep alive).
We're grouping tech-news-bot into the existing **"PC Trade In"** Render
project and reusing that project's Postgres instance — as a **separate,
fully isolated database** on it (not the trade-in app's own database), so
there's zero risk of table-name collisions or cross-app data access.

**Step 1 — Create an isolated database on the existing Postgres instance.**

1. In the Render dashboard, open the **"Gamertech trade in"** Postgres service.
2. Go to the **Connect** tab and open a shell/psql session (via Render's web
   shell if your plan has one, or copy the PSQL command and run it from a
   terminal that has `psql` installed).
3. Run:
   ```sql
   CREATE DATABASE technews;
   ```
4. Confirm it exists: `\l` should list `technews` alongside the trade-in
   app's own database. This is a completely separate namespace — Postgres
   won't let either database's tables collide with or query the other
   without an explicit cross-database extension, which we're not using.

**Step 2 — Build the connection string for the new database.**

On the same Postgres service page, copy the **Internal Database URL** (use
Internal, not External — the cron job will run in the same Render region/
private network, so internal networking is free and doesn't require the
extra SSL round-trip). It looks like:

```
postgres://user:password@dpg-xxxxxxxxxxxx-a/gamertech_trade_in
```

Swap only the database name at the end for `technews`:

```
postgres://user:password@dpg-xxxxxxxxxxxx-a/technews
```

That full string is `DATABASE_URL` for tech-news-bot. (The trade-in app's own
`DATABASE_URL` env var is untouched — you're not editing its service, just
reading connection details from the Postgres service page.)

**Step 3 — Create the cron job inside the "PC Trade In" project.**

This code lives inside the `gtq-backend` repo (same one already powering the
`gtg-backend` web service and the `tradein-followup-email` cron job) —
exactly the same "one repo, multiple Render services pointed at different
subfolders/commands" pattern `tradein-followup-email` already uses. That
means Render already has this repo authorized; you're just pointing a new
service at a different subfolder of it. Pushing to this repo will **not** by
itself create the new service — Render can't spin up a new service type on
its own from a push. You do this part once, by hand:

1. From the **PC Trade In** project page, click **+ New service** at the
   bottom of the services list → **Cron Job**.
2. Connect the **`gtq-backend`** GitHub repo (already in the list — no new
   GitHub authorization needed, since Render already has access to it for
   the other two services).
   - **Root Directory**: `tech-news-bot` (scopes the build to this subfolder
     only — its own `package.json`/dependencies, completely separate from
     the root `gtq-backend` app. It will never touch `gtg-backend`'s live
     server process or `scripts/sendTradeinFollowups.js`.)
   - **Build Command**: `npm install`
   - **Command**: `node src/index.js`
   - **Schedule**: cron syntax, **UTC only** — Render has no timezone field,
     so convert your local run time to UTC yourself (and re-check twice a
     year around DST if the exact hour matters to you)
3. **Environment** tab → add: `DATABASE_URL` (from Step 2), `ANTHROPIC_API_KEY`,
   `SHOPIFY_STORE`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_VERSION`,
   `SHOPIFY_NEWS_BLOG_TITLE`, `SHOPIFY_NEWS_BLOG_HANDLE`, `LOOKBACK_DAYS` —
   values are in `.env.example`.
4. Save, then **Trigger Run** once manually to confirm it works before
   trusting the schedule. First run will take slightly longer since
   `db.ensureSchema()` creates the bot's 4 tables inside `technews`.

**Why not merge this straight into the live `gtg-backend` server instead of
making a new service?** That was considered and deliberately avoided: that
process handles real trade-in quote traffic. Bundling in a background daily
job means a bug in the new code (or a bad dependency) could crash the whole
process — the one thing we're specifically trying not to risk. A separate
Cron Job service, even sharing this repo, means the worst case for a bug
here is "today's news post didn't get published," never "the trade-in quote
API went down."

**Three Render-specific things worth knowing:**

- **You're sharing compute/storage, not data.** The `technews` database is
  fully isolated at the SQL level from whatever the trade-in app uses — but
  both draw from the same underlying instance's storage quota and connection
  limit. For 4 small tables this is negligible; keep an eye on the Postgres
  service's storage/connections dashboard if that instance is already close
  to its plan's limits.
- **Cron jobs have no free tier.** Render bills cron jobs per second of
  actual run time with a $1/month minimum — there's no idle/always-on cost
  like a web service. For a job that runs a few minutes once a day, expect
  it to sit right around that $1/month floor.
- **No schema-setup step needed.** `src/index.js` calls `db.ensureSchema()`
  on every run (it's just `CREATE TABLE IF NOT EXISTS`, safe to repeat), so
  there's nothing to remember to run once after deploying — the first cron
  invocation sets up its own tables inside `technews`.

## Cost (approximate, at current API pricing)

- **Classification**: Haiku 4.5, ~450 tokens/headline → ~$0.001/headline.
  Even 150 headlines/day across all 7 feeds is under $0.20/day.
- **Drafting**: Sonnet 5, ~3,000 input + ~3,000 output tokens/article →
  ~$0.04–0.05/article. A handful of genuinely new products a week costs
  well under $1/month.

To use Opus 4.8 instead of Sonnet 5 for higher-quality drafts (at ~2x cost,
~$0.09/article), change `WRITER_MODEL` in `src/draft.js`.

## Design decisions worth knowing about

- **No human-approval gate.** Per your instruction, confirmed candidates are
  drafted and published automatically — there's no draft-review step. The
  corroboration requirement (2+ independent sources, or a manufacturer feed
  if you add one) is the safety net instead of a human. If you want a review
  step later, the easiest change is: in `draftAndPublishConfirmed()`, call
  `publishArticle(...)` with `published: false` and send yourself a daily
  digest instead of auto-publishing.
- **Grounding, not search.** The writer model never free-searches the web —
  it only sees the exact text fetched from the corroborating source URLs.
  This is what prevents hallucinated specs/prices; it also means if a source
  page can't be fetched (paywall, bot-blocking, JS-rendered content),
  that source is silently dropped rather than guessed at. If *all* sources
  for a candidate fail to fetch, the candidate stays `confirmed` and is
  retried on the next run instead of being published with fabricated content.
- **Internal link whitelist.** The model can only choose a GamerTech URL from
  `src/internal-links.js` — it cannot invent a link. Edit that file to point
  at real collections/pages on your store, or add a "none" fallback per
  category if you'd rather not link out.
- **Exact-match dedup.** `getOrCreateSeenProduct` matches on exact normalized
  product name. Slightly different phrasing across outlets ("RTX 5070 Ti
  Super" vs. "GeForce RTX 5070 Ti Super") can create two separate candidates
  instead of merging. This is a reasonable v1 simplification — fuzzy/LLM-based
  canonicalization is the natural next improvement if duplicate posts show up.
- **No official manufacturer feeds configured yet.** `isOfficial` sightings
  confirm a candidate from a single sighting (bypassing the 2-source rule).
  None are wired up by default — add NVIDIA/AMD/Intel/etc. newsroom RSS URLs
  to `src/sources.js` with `isOfficial: true` if you want same-day coverage
  the moment a manufacturer posts its own announcement.
- **Thumbnails come from the source article's own og:image.** For each
  confirmed candidate, `fetchArticleContent` also extracts the `og:image` (or
  `twitter:image` fallback) from the first corroborating source that has one,
  and Shopify downloads and hosts its own copy. This is deliberate: for
  hardware-announcement news specifically, that image is very often just the
  manufacturer's own press photo as reposted by the outlet. It's a judgment
  call, not a risk-free one — if you'd rather not use third-party outlets'
  hosted images at all, swap this for a fixed branded placeholder image in
  `draftAndPublishConfirmed()` (`src/index.js`) instead.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Postgres tables: `seen_products`, `candidate_sightings`, `raw_headlines_seen`, `articles` |
| `src/sources.js` | RSS feed list + fetcher |
| `src/classify.js` | Haiku 4.5 headline classifier (structured output) |
| `src/fetch-article.js` | Readability-based article text + og:image thumbnail extraction |
| `src/draft.js` | Sonnet 5 grounded article drafter (structured output) |
| `src/internal-links.js` | Whitelisted GamerTech URLs the drafter can link to |
| `src/template.js` | Renders the final `body_html` + schema.org JSON-LD |
| `src/shopify.js` | Shopify Blog API client (create blog, publish article) |
| `src/db.js` | Postgres queries: dedup, corroboration, state tracking |
| `src/index.js` | Daily run orchestration — the cron entry point |
