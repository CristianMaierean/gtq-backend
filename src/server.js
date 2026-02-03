import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { loadPriceTable } from "./priceTable.js";
import { computeQuote } from "./quote.js";

dotenv.config();

const app = express();
app.use(express.json());

/**
 * =========================
 * CORS LOCK (Shopify only)
 * =========================
 * Render env:
 * GTQ_ALLOWED_ORIGINS=https://gamertech.ca,https://www.gamertech.ca
 */
const allowedOrigins = (process.env.GTQ_ALLOWED_ORIGINS || "https://gamertech.ca")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests without Origin header (curl/health checks)
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.options("*", cors());

/**
 * =========================
 * Basic Rate Limiting (in-memory)
 * =========================
 * Prevent spam without needing any secret in the browser.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60; // 60 requests / minute / IP (adjust as needed)

const ipHits = new Map(); // ip => [timestamps]
function rateLimit(req, res, next) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const now = Date.now();
  const arr = ipHits.get(ip) || [];
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);

  if (fresh.length >= RATE_MAX) {
    ipHits.set(ip, fresh);
    return res.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
  }

  fresh.push(now);
  ipHits.set(ip, fresh);
  next();
}

app.use(rateLimit);

/**
 * =========================
 * Load prices once at boot
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
 * Public routes
 * =========================
 */
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.status(200).send("GTQ backend is running ✅"));

/**
 * =========================
 * Quote endpoint (PUBLIC, CORS-locked)
 * =========================
 * Body:
 * {
 *   selections: [{ Category, Subgroup, Brand, Item, Quantity? }],
 *   mode: "part" | "pc",
 *   pcQuantity?: number
 * }
 */
app.post("/api/quote", (req, res) => {
  try {
    const result = computeQuote(req.body || {}, OFFERS);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
});

/**
 * =========================
 * Optional: Reload prices (admin)
 * =========================
 * Set GTQ_ADMIN_KEY in Render if you want this.
 * POST /api/admin/reload with header: x-admin-key
 */
const ADMIN_KEY = process.env.GTQ_ADMIN_KEY || "";
app.post("/api/admin/reload", (req, res) => {
  if (!ADMIN_KEY) return res.status(403).json({ ok: false, error: "Admin reload disabled" });

  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) return res.status(403).json({ ok: false, error: "Forbidden" });

  reloadPrices();
  res.json({ ok: true, rows: OFFERS.size });
});

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
