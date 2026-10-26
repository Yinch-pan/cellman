export const competencyIds = [
  "income-tool-science",
  "two-spades",
  "scholar-score",
  "border-score",
  "income-vp-coins",
  "annexes",
  "tower",
  "income-book-power",
  "immediate-resources",
  "power-special",
  "city-pass",
  "min-science-pass",
] as const;
export const competencyMarket = () =>
  competencyIds.map((id, index) => ({
    id,
    color: (index % 4) as 0 | 1 | 2 | 3,
    row: Math.floor(index / 4),
    remaining: 4,
  }));
