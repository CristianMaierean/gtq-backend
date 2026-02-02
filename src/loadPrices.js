import fs from "fs";
import path from "path";

export function getPricesCsvText() {
  // 1) If hosted, use environment variable (secure)
  if (process.env.GTQ_PRICES_CSV && process.env.GTQ_PRICES_CSV.trim()) {
    return process.env.GTQ_PRICES_CSV;
  }

  // 2) If local, read the CSV file
  const csvPath = path.join(process.cwd(), "data", "gtq-prices.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(
      "Missing data/gtq-prices.csv and GTQ_PRICES_CSV env var is not set."
    );
  }

  return fs.readFileSync(csvPath, "utf8");
}
