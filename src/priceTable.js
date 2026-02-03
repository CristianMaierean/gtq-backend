import { getPricesCsvText } from "./loadPrices.js";

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Minimal CSV parser that supports quoted commas
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      // escaped quote
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    cur += ch;
  }

  // last cell
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }

  return rows.map(r => r.map(v => clean(v)));
}

function toNumber(v) {
  const n = Number(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function loadPriceTable() {
  const text = getPricesCsvText();
  const rows = parseCsv(text);

  if (!rows.length || rows.length < 2) throw new Error("CSV appears empty");

  const headers = rows[0];
  const idx = (name) => headers.indexOf(name);

  const iCat = idx("Category");
  const iSub = idx("Subgroup");
  const iBrand = idx("Brand");
  const iItem = idx("Item");
  const iCash = idx("Cash offer");
  const iCredit = idx("Store Credit Offer");

  if ([iCat, iSub, iBrand, iItem, iCash, iCredit].some(i => i === -1)) {
    throw new Error("CSV headers missing. Required: Category,Subgroup,Brand,Item,Cash offer,Store Credit Offer");
  }

  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < headers.length) continue;

    const key = `${clean(cols[iCat])}||${clean(cols[iSub])}||${clean(cols[iBrand])}||${clean(cols[iItem])}`;

    map.set(key, {
      cash: toNumber(cols[iCash]),
      credit: toNumber(cols[iCredit]),
    });
  }

  return map;
}
