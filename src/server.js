// src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { loadPriceTable } from "./priceTable.js";
import { computeQuote } from "./quote.js";
import { initLeadTable, upsertLead } from "./db.js";

dotenv.config();

const app = express();

/**
 * =========================
 * CORS (Shopify only)
 * =========================
 * Render env:
 * GTQ_ALLOWED_ORIGINS = https://gamertech.ca,https://www.gamertech.ca
 *
 * IMPORTANT:
 * - Do NOT throw an error in the origin callback (it can break preflight)
 * - Handle OPTIONS with the SAME cors options
 */
const allowedOrigins = (process.env.GTQ_ALLOWED_ORIGINS ||
  "https://gamertech.ca,https://www.gamertech.ca")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow no-origin requests (Render health checks, curl, etc.)
    if (!origin) return cb(null, true);

    // Allow your storefront domains
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // IMPORTANT: don't "error" here — just disallow
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"], // add "Authorization" if you ever need it
  credentials: false,
  optionsSuccessStatus: 204,
};

// CORS must be registered BEFORE routes
app.use(cors(corsOptions));
// Ensure preflight always gets handled correctly
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));

/**
 * =========================
 * Load pricing table from CSV env
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
 * Init Postgres lead table (non-fatal)
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
 * Lead capture endpoints
 * - NEVER block or break quoting
 * - Always return ok:true immediately
 */
app.post("/api/leads/quote", (req, res) => {
  res.json({ ok: true });

  upsertLead({
    ...req.body,
    stage: "BROWSING",
  }).catch((e) =>
    console.error("❌ lead STEP1 save failed:", e?.message || e)
  );
});

app.post("/api/leads/lock", (req, res) => {
  res.json({ ok: true });

  upsertLead({
    ...req.body,
    stage: "COMPLETED",
  }).catch((e) =>
    console.error("❌ lead STEP2 save failed:", e?.message || e)
  );
});

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));