import fs from "fs";

function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function splitCsvLine(line) {
  return line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
}

export function loadPriceTable(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8");
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

  const required = [
    ["Category", iCat],
    ["Subgroup", iSub],
    ["Brand", iBrand],
    ["Item", iItem],
    ["Cash offer", iCash],
    ["Store Credit Offer", iCredit],
  ];
  for (const [name, i] of required) {
    if (i === -1) throw new Error(`Missing required column: ${name}`);
  }

  const map = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < headers.length) continue;

    const Category = clean(cols[iCat]);
    const Subgroup = clean(cols[iSub]);
    const Brand = clean(cols[iBrand]);
    const Item = clean(cols[iItem]);

    const key = `${Category}||${Subgroup}||${Brand}||${Item}`;

    map.set(key, {
      cash: Number(cols[iCash] || 0),
      credit: Number(cols[iCredit] || 0),
    });
  }

  return map;
}
