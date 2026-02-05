import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { loadPriceTable } from "./priceTable.js";
import { computeQuote } from "./quote.js";
import { initLeadTable, upsertLead } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

/**
 * =========================
 * CORS SETUP
 * =========================
 */

// Locked origins for quote endpoint
const allowedOrigins = (process.env.GTQ_ALLOWED_ORIGINS ||
  "https://gamertech.ca,https://www.gamertech.ca"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsLocked = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow server-to-server/health checks
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // Optional (helps Shopify preview):
    // if (origin.endsWith(".myshopify.com")) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

// Open CORS for leads (so beacons + previews don’t break)
const corsOpen = cors({
  origin: true,
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

/**
 * Apply CORS per-route (IMPORTANT)
 */
app.use("/api/leads", corsOpen);
app.options("/api/leads/*", corsOpen);

app.use("/api/quote", corsLocked);
app.options("/api/quote", corsLocked);

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

// Leads (never block UX)
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

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));