import fs from "fs";
import path from "path";

/**
 * ✅ Keeps CSV private:
 * - Stored on Render filesystem (in your repo) OR
 * - Stored in env var (PRICES_CSV_TEXT) as fallback
 *
 * Recommended:
 * - Put your file at: ./data/prices.csv
 */
export function getPricesCsvText() {
  // Option A: load from env (fallback)
  const envText = process.env.PRICES_CSV_TEXT;
  if (envText && envText.trim().length > 0) return envText;

  // Option B: load from file path
  // You can override with PRICES_CSV_PATH in Render if you want.
  const csvPath =
    process.env.PRICES_CSV_PATH ||
    path.join(process.cwd(), "data", "prices.csv");

  try {
    return fs.readFileSync(csvPath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read prices CSV at ${csvPath}. Set PRICES_CSV_PATH or PRICES_CSV_TEXT.`
    );
  }
}
