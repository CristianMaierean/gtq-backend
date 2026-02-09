function clean(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function normBrand(v) {
  const b = clean(v);
  if (!b || b.toLowerCase() === "any") return "N/A";
  return b;
}

export function computeQuote({ selections, mode }, offersMap) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: "Missing selections" };
  }

  let cash = 0;
  let credit = 0;

  for (const p of selections) {
    const key = `${clean(p.Category)}||${clean(p.Subgroup)}||${normBrand(p.Brand)}||${clean(p.Item)}`;
    const offer = offersMap.get(key);

    if (!offer) {
      return {
        ok: false,
        error: `No price found for: ${p.Category} / ${p.Subgroup} / ${p.Brand} / ${p.Item}`,
      };
    }

    cash += Number(offer.cash || 0);
    credit += Number(offer.credit || 0);
  }

  // Full PC rule: must have GPU + CPU + RAM
  if (mode === "pc") {
    const hasGPU = selections.some(p => clean(p.Category) === "GPU");
    const hasCPU = selections.some(p => clean(p.Category) === "CPU");
    const hasRAM = selections.some(p => clean(p.Category) === "RAM");

    if (!hasGPU || !hasCPU || !hasRAM) {
      return { ok: false, error: "Full Gaming PC requires GPU + CPU + RAM." };
    }

    cash += 50;
    credit += 100;
  }

  return {
    ok: true,
    cash: Math.round(cash),
    credit: Math.round(credit),
  };
}