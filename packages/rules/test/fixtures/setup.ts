export function sampleSetup(): any {
  return {
    id: "test-game",
    rulesVersion: "aoi-1.1+2024-09",
    mapId: "official-large",
    players: [
      {
        seat: "p1",
        name: "甲",
        native: "forest",
        faction: "blessed",
        bonus: "coins",
      },
      {
        seat: "p2",
        name: "乙",
        native: "lake",
        faction: "navigators",
        bonus: "power",
      },
      {
        seat: "p3",
        name: "丙",
        native: "mountain",
        faction: "goblins",
        bonus: "guild",
      },
    ],
    roundTiles: [
      "workshop-law",
      "guild-law",
      "school-bank",
      "big-medicine",
      "city-engineering",
      "innovation-law",
    ],
    finalRoundTile: "workshop",
    palaces: [
      "income-power",
      "workshop-score",
      "city-discount",
      "free-competency",
    ],
    innovations: ["colleges", "sewerage", "league-of-cities"],
    bonusPool: ["coins", "power", "guild", "scholar", "school", "bigbuilding"],
  };
}
