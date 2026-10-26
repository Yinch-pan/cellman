export type SeatId = string;
export type HexId = string;
export type Terrain =
  "desert" | "plains" | "swamp" | "lake" | "forest" | "mountain" | "wasteland";
export type Discipline = 0 | 1 | 2 | 3;
export type Four = [number, number, number, number];
export interface HexDefinition {
  id: HexId;
  terrain: Terrain | "river";
  q: number;
  r: number;
  x: number;
  y: number;
}
export interface BoardMap {
  id: string;
  hexes: Record<HexId, HexDefinition>;
  neighbors: Record<HexId, HexId[]>;
}
export type BuildingKind =
  | "workshop"
  | "guild"
  | "school"
  | "palace"
  | "university"
  | "tower"
  | "monument";
export interface Building {
  seat: SeatId;
  kind: BuildingKind;
  cityId?: string;
  annex?: boolean;
  neutral?: boolean;
}
export interface Bridge {
  seat: SeatId;
  a: HexId;
  b: HexId;
}
export interface Resources {
  coins: number;
  tools: number;
  scholars: number;
  books: Four;
  power: [number, number, number];
}
export interface Player {
  seat: SeatId;
  name: string;
  native: Terrain;
  faction: string;
  resources: Resources;
  vp: number;
  science: Four;
  keys: number;
  keysUsed: number;
  terraformLevel: number;
  sailing: number;
  innovations: string[];
  competencies: string[];
  annexes: number;
  palace: string | null;
  draftPalace?: string;
  bonus: string;
  passed: boolean;
  primaryDone: boolean;
  extraActions?: number;
  usedSpecials: string[];
  leechPolicy: { enabled: boolean; maxVpCost: number };
}
export interface SetupConfig {
  id: string;
  rulesVersion: string;
  mapId: string;
  players: {
    seat: SeatId;
    name: string;
    native: Terrain;
    faction: string;
    bonus: string;
  }[];
  roundTiles: string[];
  finalRoundTile: string;
  palaces: string[];
  innovations: string[];
  bonusPool: string[];
  bookActions?: string[];
  offers?: { native: Terrain; faction: string; bonus: string }[];
  competencyOrder?: string[];
  draft?: {
    direction: "forward" | "reverse";
    pools: {
      faction: string[];
      native: Terrain[];
      palace: string[];
      bonus: string[];
    };
  };
  innovationCosts?: Record<string, Four>;
}
export interface PendingChoice {
  id: string;
  seat: SeatId;
  kind:
    | "leech"
    | "city"
    | "competency"
    | "book"
    | "science"
    | "spades"
    | "bridge"
    | "freeGuild"
    | "freeWorkshop"
    | "neutral"
    | "key"
    | "buildWorkshop";
  amount: number;
  options: string[];
  continuation: { kind: "resume-turn" };
  source: string;
  buildingKind?: BuildingKind;
  scienceTrack?: Discipline;
  canBuild?: boolean;
  canBuySpades?: boolean;
  dependsOn?: string[];
  triggerRevision?: number;
  batch?: string;
  freeBuild?: boolean;
  travelPaid?: boolean;
}
export interface RuleEvent {
  kind: string;
  seat?: SeatId;
  text: string;
  details?: Record<string, unknown>;
}
export interface ScoreBreakdown {
  seat: SeatId;
  items: {
    reason: string;
    points: number;
    sourceRefs: { sourceId: string; page: number }[];
  }[];
  total: number;
}
export interface GameState {
  schemaVersion: 1;
  rulesVersion: string;
  revision: number;
  setup: SetupConfig;
  phase:
    | "draft"
    | "setup"
    | "placement"
    | "income"
    | "actions"
    | "science"
    | "finished";
  round: number;
  activeSeat: SeatId;
  players: Record<SeatId, Player>;
  board: {
    mapId: string;
    terrain: Partial<Record<HexId, Terrain>>;
    buildings: Record<HexId, Building>;
    bridges: Bridge[];
    cityLinks?: { seat: SeatId; river: HexId }[];
  };
  shared: {
    usedActions: string[];
    bookActions: string[];
    scholarSlots: (SeatId | null)[][];
    cities: Record<string, number>;
    palaces: string[];
    innovations: string[];
    bonusCoins: Record<string, number>;
    competencies: {
      id: string;
      color: Discipline;
      row: number;
      remaining: number;
    }[];
  };
  pending: PendingChoice[];
  status: "active" | "finished";
  turnOrder: SeatId[];
  passOrder: SeatId[];
  placementOrder: SeatId[];
  placementIndex: number;
  choiceSerial: number;
  draftIndex?: number;
  chosenOffers?: number[];
  draftPicks?: Record<
    SeatId,
    Partial<{ faction: string; native: Terrain; palace: string; bonus: string }>
  >;
  activeEffectBatch?: string;
  placementKinds?: BuildingKind[];
  scores: ScoreBreakdown[];
  matchResult?: {
    reason: "forfeit" | "inactive";
    at: string;
    loser?: SeatId;
    winners: SeatId[];
    round: number;
  };
}
export type GameAction =
  | {
      kind: "draftPick";
      category: "faction" | "native" | "palace" | "bonus";
      option: string;
    }
  | { kind: "turn"; actions: Exclude<GameAction, { kind: "turn" }>[] }
  | { kind: "riverCity"; hex: HexId }
  | { kind: "chooseSetup"; offer: number }
  | {
      kind: "place";
      hex: HexId;
      building?: "workshop" | "tower" | "university";
    }
  | {
      kind: "terraform";
      hex: HexId;
      terrain: Terrain;
      build: boolean;
      deferBuild?: boolean;
      additional?: { hex: HexId; terrain: Terrain }[];
      travel?: "tunnel" | "flight";
    }
  | { kind: "upgrade"; hex: HexId; to: BuildingKind; palace?: string }
  | {
      kind: "convert";
      from: "power" | "scholar" | "tool" | "book";
      to: "coin" | "tool" | "scholar" | "book";
      count: number;
      color?: Discipline;
    }
  | { kind: "burn"; count: number }
  | { kind: "scholar"; track: Discipline; slot: number | null }
  | { kind: "advance"; track: "sailing" | "terraform" }
  | {
      kind: "powerAction";
      travel?: "tunnel" | "flight";
      id: string;
      hex?: HexId;
      terrain?: Terrain;
      build?: boolean;
      deferBuild?: boolean;
      a?: HexId;
      b?: HexId;
      additional?: { hex: HexId; terrain: Terrain }[];
      color?: Discipline;
    }
  | { kind: "innovation"; id: string; books: Four }
  | {
      kind: "bookAction";
      id: string;
      books: Four;
      track?: Discipline;
      hex?: HexId;
    }
  | {
      kind: "special";
      source: string;
      hex?: HexId;
      a?: HexId;
      b?: HexId;
      track?: Discipline;
    }
  | { kind: "pass"; bonus?: string }
  | { kind: "endTurn" }
  | {
      kind: "respond";
      choiceId: string;
      option: string;
      terraform?: {
        hex: HexId;
        terrain: Terrain;
        build: boolean;
        deferBuild?: boolean;
        additional?: { hex: HexId; terrain: Terrain }[];
        travel?: "tunnel" | "flight";
      };
    }
  | { kind: "setLeech"; enabled: boolean; maxVpCost: number };
export interface ActionOption {
  kind: GameAction["kind"];
  label: string;
}
export interface RuleError {
  code: string;
  message: string;
}
export type Transition =
  | { ok: true; state: GameState; events: RuleEvent[] }
  | { ok: false; error: RuleError };
export interface RuleSet {
  createGame: (setup: SetupConfig) => GameState;
  getLegalActions: (state: GameState, seat: SeatId) => ActionOption[];
  applyAction: (
    state: GameState,
    seat: SeatId,
    action: GameAction,
  ) => Transition;
  getWaitingSeats: (state: GameState) => SeatId[];
}
export interface RuleCase {
  id: string;
  sourceRefs: { sourceId: string; page: number }[];
  before: GameState;
  actor: SeatId;
  action: GameAction;
  expectedState: GameState;
  expectedEvents: RuleEvent[];
}
