function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function keyFromPart(p) {
  const Category = clean(p?.Category);
  const Subgroup = clean(p?.Subgroup);
  const Brand = clean(p?.Brand);
  const Item = clean(p?.Item);
  return `${Category}||${Subgroup}||${Brand}||${Item}`;
}

function qtyFromPart(p) {
  const q = Number(p?.Quantity ?? 1);
  return Number.isFinite(q) && q > 0 ? Math.floor(q) : 1;
}

/**
 * computeQuote()
 * - Returns BOTH cash + credit every time
 * - mode "part": sums selections (each can have Quantity)
 * - mode "pc": requires at least CPU + GPU
 *    cash = (cpu cash + gpu cash + 50) * pcQuantity
 *    credit = (cpu credit + gpu credit + 100) * pcQuantity
 */
export function computeQuote({ selections, mode = "part", pcQuantity = 1 }, offersMap) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: "Missing selections" };
  }

  let cash = 0;
  let credit = 0;

  // validate pcQuantity
  const pcQty = (() => {
    const n = Number(pcQuantity);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.floor(n);
  })();

  // Sum parts
  for (const p of selections) {
    const key = keyFromPart(p);
    const offer = offersMap.get(key);

    if (!offer) {
      return {
        ok: false,
        error: `No price found for: ${clean(p?.Category)} / ${clean(p?.Brand)} / ${clean(p?.Item)} (Subgroup: ${clean(p?.Subgroup) || "—"})`,
      };
    }

    const qty = qtyFromPart(p);

    cash += Number(offer.cash || 0) * qty;
    credit += Number(offer.credit || 0) * qty;
  }

  // PC rule: must have CPU + GPU (+ optional RAM), then add bonus
if (mode === "pc") {
  const hasCPU = selections.some(p => p.Category === "CPU");
  const hasGPU = selections.some(p => p.Category === "GPU");

  if (!hasCPU || !hasGPU) {
    return { ok: false, error: "PC quote requires at least CPU + GPU." };
  }

  // RAM is optional but included if present
  // (already added to cash/credit during the loop above)

  cash += 50;
  credit += 100;
}


  // part mode
  return {
    ok: true,
    mode: "part",
    cash: Math.round(cash),
    credit: Math.round(credit),
  };
}
