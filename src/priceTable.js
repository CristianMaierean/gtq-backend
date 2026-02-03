import { getPricesCsvText } from "./loadPrices.js";

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

// Basic CSV parser that supports quoted values with commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cur);
      cur = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur);
      rows.push(row.map((c) => c.trim()));
      row = [];
      cur = "";
      continue;
    }
    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row.map((c) => c.trim()));
  }

  return rows;
}

export function loadPriceTable() {
  const text = getPricesCsvText();
  const rows = parseCsv(String(text || "").trim());
  if (rows.length < 2) throw new Error("CSV appears empty");

  const headers = rows[0].map(clean);
  const idx = (name) => headers.indexOf(name);

  const iCat = idx("Category");
  const iSub = idx("Subgroup");
  const iBrand = idx("Brand");
  const iItem = idx("Item");
  const iCash = idx("Cash offer");
  const iCredit = idx("Store Credit Offer");

  if ([iCat, iSub, iBrand, iItem, iCash, iCredit].some((i) => i < 0)) {
    throw new Error(
      `CSV headers missing. Required: Category, Subgroup, Brand, Item, Cash offer, Store Credit Offer`
    );
  }

  const map = new Map();

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || cols.length < headers.length) continue;

    const Category = clean(cols[iCat]);
    const Subgroup = clean(cols[iSub]);
    const Brand = clean(cols[iBrand]);
    const Item = clean(cols[iItem]);

    if (!Category || !Item) continue;

    const key = `${Category}||${Subgroup}||${Brand}||${Item}`;

    map.set(key, {
      cash: Number(cols[iCash] || 0),
      credit: Number(cols[iCredit] || 0),
    });
  }

  return map;
}
