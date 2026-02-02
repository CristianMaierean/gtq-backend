export function computeQuote({ selections, mode }, offersMap) {
  if (!Array.isArray(selections) || selections.length === 0) {
    return { ok: false, error: "Missing selections" };
  }

  let cash = 0;
  let credit = 0;

  for (const p of selections) {
    const key = `${p.Category}||${p.Subgroup}||${p.Brand}||${p.Item}`;
    const offer = offersMap.get(key);
    if (!offer) {
      return { ok: false, error: `No price found for: ${p.Category} / ${p.Item}` };
    }
    cash += offer.cash;
    credit += offer.credit;
  }

  // PC rule: must have CPU + GPU, then add bonus
  if (mode === "pc") {
    const hasCPU = selections.some(p => p.Category === "CPU");
    const hasGPU = selections.some(p => p.Category === "GPU");
    if (!hasCPU || !hasGPU) {
      return { ok: false, error: "PC quote requires at least CPU + GPU." };
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
