import { getPricesCsvText } from "./loadPrices.js";

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function splitCsvLine(line) {
  return line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
}

export function loadPriceTable() {
  const text = getPricesCsvText(); // ✅ THIS IS THE FIX
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV appears empty");

  const headers = splitCsvLine(lines[0]);
  const idx = (name) => headers.indexOf(name);

  const iCat = idx("Category");
  const iSub = idx("Subgroup");
  const iBrand = idx("Brand");
  const iItem = idx("Item");
  const iCash = idx("Cash offer");
  const iCredit = idx("Store Credit Offer");

  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);

    const key = `${clean(cols[iCat])}||${clean(cols[iSub])}||${clean(cols[iBrand])}||${clean(cols[iItem])}`;

    map.set(key, {
      cash: Number(cols[iCash] || 0),
      credit: Number(cols[iCredit] || 0),
    });
  }

  return map;
}
