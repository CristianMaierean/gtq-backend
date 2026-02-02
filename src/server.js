import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { loadPriceTable } from "./priceTable.js";
import { computeQuote } from "./quote.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); // later we’ll lock this down to gamertech.ca only

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, "..", "data", "gtq-prices.csv");

let OFFERS = new Map();

function reloadPrices() {
  OFFERS = loadPriceTable(CSV_PATH);
  console.log("✅ Loaded pricing rows:", OFFERS.size);
}
reloadPrices();

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/quote", (req, res) => {
  const { selections, mode } = req.body || {};
  const result = computeQuote({ selections, mode }, OFFERS);
  res.json(result);
});

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => console.log(`✅ Running: http://localhost:${PORT}`));
