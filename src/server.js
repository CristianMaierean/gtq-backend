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
 * 1) CORS LOCK (Shopify only)
 * =========================
 * Set GTQ_ALLOWED_ORIGINS in Render:
 *   https://gamertech.ca,https://www.gamertech.ca
 */
const allowedOrigins = (process.env.GTQ_ALLOWED_ORIGINS || "https://gamertech.ca")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin (no Origin header) for tools like curl/health checks
      if (!origin) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-gtq-key"],
  })
);

// Nice preflight handling
app.options("*", cors());

/**
 * =========================
 * 2) API KEY LOCK (real security)
 * =========================
 * Set GTQ_API_KEY in Render (a long secret)
 * Frontend must send: header "x-gtq-key": "<your key>"
 */
const API_KEY = process.env.GTQ_API_KEY || "";

// Protect only the endpoints you care about
function requireApiKey(req, res, next) {
  // Only lock these paths
  const locked =
    req.path.startsWith("/api/") || req.path.startsWith("/ebay/");

  if (!locked) return next();

  // If you forgot to set the key on Render, fail safely in production
  if (!API_KEY) {
    return res.status(500).json({
      error: "Server missing GTQ_API_KEY env var",
    });
  }

  const key = req.headers["x-gtq-key"];
  if (!key || key !== API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

app.use(requireApiKey);

/**
 * =========================
 * 3) Load prices
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
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.status(200).send("GTQ backend is running ✅");
});

/**
 * =========================
 * Locked routes (needs x-gtq-key)
 * =========================
 */
app.get("/ebay/active-test", (req, res) => {
  res.json({
    ok: true,
    message: "active-test route works ✅",
    q: req.query.q || null,
  });
});

app.post("/api/quote", (req, res) => {
  const { selections, mode } = req.body || {};
  const result = computeQuote({ selections, mode }, OFFERS);
  res.json(result);
});

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running on port ${PORT}`));
