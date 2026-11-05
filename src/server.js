import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "node:crypto";

import { loadPriceTable } from "./priceTable.js";
import { computeQuote } from "./quote.js";
import { initLeadTable, upsertLead } from "./db.js";

dotenv.config();

const app = express();

/**
 * =========================================================================
 * OpenAI ChatGPT Ads — server-side purchase (order_created) relay
 * =========================================================================
 * Shopify's hosted checkout and order-status pages don't render theme code
 * (Checkout Extensibility removed script injection there), so the browser
 * pixel in theme.liquid can never see a completed order. This route is fed
 * by a Shopify "orders/paid" webhook instead — it fires exactly once per
 * order that actually gets paid (not on abandoned/unpaid checkouts), which
 * is both more accurate and immune to the thank-you page being reloaded.
 *
 * Registered BEFORE express.json() below because Shopify's webhook HMAC is
 * computed over the exact raw request body — once a body-parsing middleware
 * has consumed/reserialized it, the signature can no longer be verified.
 *
 * Required env vars (set in Render):
 *   SHOPIFY_WEBHOOK_SECRET      — the Shopify app's API secret key (NOT the
 *                                 Admin API access token), used to verify
 *                                 X-Shopify-Hmac-Sha256.
 *   OPENAI_CONVERSIONS_API_KEY  — created in OpenAI Ads Manager via
 *                                 POST /v1/conversions/api_keys. Must stay
 *                                 server-side only, never shipped to the browser.
 *   OPENAI_PIXEL_ID             — optional, defaults to the GamerTech pixel below.
 *
 * Until both secrets are set, the route still verifies/acknowledges the
 * webhook (so Shopify doesn't disable it for repeated failures) but logs a
 * warning and skips the OpenAI call.
 */
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;
const OPENAI_PIXEL_ID = process.env.OPENAI_PIXEL_ID || "FjCXaH91aGHxAf5ZVevWVk";
const OPENAI_CONVERSIONS_API_KEY = process.env.OPENAI_CONVERSIONS_API_KEY;

function verifyShopifyHmac(rawBody, hmacHeader) {
  if (!SHOPIFY_WEBHOOK_SECRET || !hmacHeader) return false;
  const digest = crypto.createHmac("sha256", SHOPIFY_WEBHOOK_SECRET).update(rawBody).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false; // header wasn't valid base64 / length mismatch
  }
}

async function relayOrderCreatedToOpenAI(order) {
  if (!OPENAI_CONVERSIONS_API_KEY) {
    console.warn(`⚠️  [openai-ads] OPENAI_CONVERSIONS_API_KEY not set — skipping order_created relay for order ${order.id}`);
    return;
  }

  const currency = order.currency || order.presentment_currency || "CAD";
  const toMinorUnits = (v) => Math.round(parseFloat(v || "0") * 100);
  const eventId = `order_${order.id}`;

  const payload = {
    events: [{
      id: eventId, // stable per order -> OpenAI dedupes retries/re-deliveries on this
      type: "order_created",
      timestamp_ms: Date.parse(order.processed_at || order.created_at || new Date().toISOString()),
      action_source: "web",
      source_url: "https://gamertech.ca/",
      data: {
        type: "contents",
        amount: toMinorUnits(order.total_price),
        currency,
        contents: (order.line_items || []).slice(0, 50).map((li) => ({
          id: li.sku || String(li.variant_id || li.product_id || ""),
          name: li.title,
          content_type: "product",
          quantity: li.quantity,
          amount: toMinorUnits(li.price),
          currency,
        })),
      },
    }],
  };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(`https://bzr.openai.com/v1/events?pid=${OPENAI_PIXEL_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_CONVERSIONS_API_KEY}` },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        console.log(`✅ [openai-ads] order_created relayed for order ${order.id} (event_id ${eventId})`);
        return;
      }
      const text = await r.text().catch(() => "");
      console.error(`❌ [openai-ads] OpenAI returned ${r.status} for order ${order.id}: ${text.slice(0, 300)}`);
    } catch (e) {
      console.error(`❌ [openai-ads] request failed (attempt ${attempt}/${MAX_ATTEMPTS}) for order ${order.id}:`, e?.message || e);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 1000 * attempt));
  }
  console.error(`❌ [openai-ads] gave up relaying order_created for order ${order.id} after ${MAX_ATTEMPTS} attempts`);
}

app.post("/webhooks/shopify/orders-paid", express.raw({ type: "application/json", limit: "5mb" }), (req, res) => {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const rawBody = req.body; // Buffer — express.raw(), not express.json(), on this route only

  if (!verifyShopifyHmac(rawBody, hmacHeader)) {
    console.error("❌ [openai-ads] Shopify webhook HMAC verification failed");
    return res.status(401).send("invalid signature");
  }

  // Shopify requires a fast 2xx ack (it will retry/eventually disable the webhook otherwise).
  // Downstream relay to OpenAI happens after responding, with its own retry loop above.
  res.status(200).send("ok");

  let order;
  try {
    order = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    console.error("❌ [openai-ads] could not parse Shopify order payload:", e?.message || e);
    return;
  }
  relayOrderCreatedToOpenAI(order).catch((e) => console.error("❌ [openai-ads] unexpected relay error:", e?.message || e));
});

app.use(express.json());

/**
 * =========================
 * CORS (Shopify storefront)
 * =========================
 * Render env:
 * GTQ_ALLOWED_ORIGINS = https://gamertech.ca,https://www.gamertech.ca
 */
const allowedOrigins = (process.env.GTQ_ALLOWED_ORIGINS || "https://gamertech.ca,https://www.gamertech.ca")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow no-origin requests (Render health checks, curl, etc.)
    if (!origin) return cb(null, true);

    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true, // IMPORTANT: fixes your “Access-Control-Allow-Credentials” error
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
};

app.use(cors(corsOptions));
// IMPORTANT: preflight must use SAME options (NOT cors() with defaults)
app.options("*", cors(corsOptions));

/**
 * =========================
 * Load pricing table
 * =========================
 */
let OFFERS = new Map();

function reloadPrices() {
  OFFERS = loadPriceTable();
  console.log("✅ Loaded pricing rows:", OFFERS.size);
}
reloadPrices();

/**
 * =========================
 * Init Postgres lead table
 * =========================
 */
initLeadTable()
  .then(() => console.log("✅ Lead table ready (gtq_leads)"))
  .catch((e) => console.error("❌ Lead table init failed:", e?.message || e));

/**
 * =========================
 * Routes
 * =========================
 */
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.status(200).send("GTQ backend is running ✅"));

app.post("/api/quote", (req, res) => {
  try {
    const { selections, mode } = req.body || {};
    const result = computeQuote({ selections, mode }, OFFERS);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

/**
 * Lead capture (POST only)
 * Note: “Cannot GET /api/leads/quote” is normal if you open it in a browser.
 */
app.post("/api/leads/quote", (req, res) => {
  res.json({ ok: true });

  upsertLead({ ...req.body, stage: "BROWSING" }).catch((e) =>
    console.error("❌ lead STEP1 save failed:", e?.message || e)
  );
});

app.post("/api/leads/lock", (req, res) => {
  res.json({ ok: true });

  upsertLead({ ...req.body, stage: "COMPLETED" }).catch((e) =>
    console.error("❌ lead STEP2 save failed:", e?.message || e)
  );
});

// Optional: clean JSON error for CORS blocks (helps debugging)
app.use((err, req, res, next) => {
  if (String(err?.message || "").startsWith("CORS blocked")) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));