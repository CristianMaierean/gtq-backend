export function getPricesCsvText() {
  const text = process.env.GTQ_PRICES_CSV || "";
  if (!text.trim()) {
    throw new Error("Missing GTQ_PRICES_CSV env var (CSV content is empty).");
  }
  return text;
}
