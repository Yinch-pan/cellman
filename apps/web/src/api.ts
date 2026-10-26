import { t as translate } from "./i18n";
import { factions, palaces, innovations } from "./i18n/content";
import { tileCode, competencyCodes, bonusCodes } from "./i18n/tile-codes";
import { translateRuleText } from "./i18n/presentation";
let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export class RequestError extends Error {
  constructor(public code: string) {
    super(messages[code] ?? translate("ui.api.1320cde4dd"));
  }
}
const messages: Record<string, string> = {
  PLAYER_REMOVED: translate("error.PLAYER_REMOVED"),
  RESULT_ALREADY_SETTLED: translate("error.RESULT_ALREADY_SETTLED"),
  RESULT_NOT_SETTLED: translate("error.RESULT_NOT_SETTLED"),
  PLAYER_NOT_OVERDUE: translate("error.PLAYER_NOT_OVERDUE"),
  OWN_CLOCK_WORSE: translate("error.OWN_CLOCK_WORSE"),
  CLOCK_PAUSED: translate("error.CLOCK_PAUSED"),
  INVALID_TIMEOUT_TARGET: translate("error.INVALID_TIMEOUT_TARGET"),
  GAME_FINISHED: translate("error.GAME_FINISHED"),
  GAME_INACTIVE: translate("error.GAME_INACTIVE"),
  ASYNC_TIME_REQUIRED: translate("error.ASYNC_TIME_REQUIRED"),
  DRAFT_PICK_REQUIRED: translate("error.DRAFT_PICK_REQUIRED"),
  SETUP_UNAVAILABLE: translate("error.SETUP_UNAVAILABLE"),
  MAIL_DISABLED: translate("error.MAIL_DISABLED"),
  REGISTRATION_PENDING: translate("error.REGISTRATION_PENDING"),
  REGISTRATION_ALREADY_VERIFIED: translate(
    "error.REGISTRATION_ALREADY_VERIFIED",
  ),
  MAIL_RATE_LIMIT: translate("error.MAIL_RATE_LIMIT"),
  EMAIL_LINK_INVALID: translate("error.EMAIL_LINK_INVALID"),
  EMAIL_UNAVAILABLE: translate("error.EMAIL_UNAVAILABLE"),
  EMAIL_ALREADY_VERIFIED: translate("error.EMAIL_ALREADY_VERIFIED"),
  EMAIL_VERIFY_FIRST: translate("error.EMAIL_VERIFY_FIRST"),
  ROOM_SETTINGS_CHANGED: translate("error.ROOM_SETTINGS_CHANGED"),
  ROOM_TOO_SMALL: translate("error.ROOM_TOO_SMALL"),
  HOST_REQUIRED: translate("error.HOST_REQUIRED"),
  ROOM_STARTED: translate("error.ROOM_STARTED"),
  ROOM_CLOSED: translate("error.ROOM_CLOSED"),
  INVALID_SEATS: translate("error.INVALID_SEATS"),
  UNDO_DISABLED: translate("error.UNDO_DISABLED"),
  INVALID_INPUT: translate("error.INVALID_INPUT"),
  TURN_NOT_FINISHED: translate("error.TURN_NOT_FINISHED"),
  TURN_RESPONSE_REQUIRED: translate("error.TURN_RESPONSE_REQUIRED"),
  TURN_ALREADY_ENDED: translate("error.TURN_ALREADY_ENDED"),
  INVALID_TURN: translate("error.INVALID_TURN"),
  FINISH_PALACE_REWARDS: translate("error.FINISH_PALACE_REWARDS"),
  INVALID_STARTING_BUILDING: translate("error.INVALID_STARTING_BUILDING"),
  CANNOT_BUY_SPADES: translate("error.CANNOT_BUY_SPADES"),
  CANNOT_BUY_PARTIAL_SPADES: translate("error.CANNOT_BUY_PARTIAL_SPADES"),
  INVALID_TERRAFORM: translate("error.INVALID_TERRAFORM"),
  EMPTY_ACTION: translate("error.EMPTY_ACTION"),
  INVALID_COUNT: translate("error.INVALID_COUNT"),
  INVALID_HEX: translate("error.INVALID_HEX"),
  BRIDGE_OCCUPIED: translate("error.BRIDGE_OCCUPIED"),
  BRIDGE_NEEDS_BUILDING: translate("error.BRIDGE_NEEDS_BUILDING"),
  UNDO_PENDING: translate("error.UNDO_PENDING"),
  INVALID_UNDO_TARGET: translate("error.INVALID_UNDO_TARGET"),
  COMMAND_REUSE: translate("error.COMMAND_REUSE"),
  INVALID_FREE_BUILD: translate("error.INVALID_FREE_BUILD"),
  FINISH_EFFECT_BATCH: translate("error.FINISH_EFFECT_BATCH"),
  WAIT_DEPENDENCY: translate("error.WAIT_DEPENDENCY"),
  NO_CITY_CREATED: translate("error.NO_CITY_CREATED"),
  INVALID_RIVER_CITY: translate("error.INVALID_RIVER_CITY"),
  TRACK_MAX: translate("error.TRACK_MAX"),
  NO_BUILDING_SUPPLY: translate("error.NO_BUILDING_SUPPLY"),
  NO_BRIDGE_SUPPLY: translate("error.NO_BRIDGE_SUPPLY"),
  SPECIAL_USED: translate("error.SPECIAL_USED"),
  INVALID_PHASE: translate("error.INVALID_PHASE"),
  ACTION_OCCUPIED: translate("error.ACTION_OCCUPIED"),
  INSUFFICIENT_BOOKS: translate("error.INSUFFICIENT_BOOKS"),
  INVALID_BRIDGE_SITE: translate("error.INVALID_BRIDGE_SITE"),
  NO_SURPLUS_SPADES: translate("error.NO_SURPLUS_SPADES"),
  FIRST_TERRAIN_INCOMPLETE: translate("error.FIRST_TERRAIN_INCOMPLETE"),
  INVALID_CREDENTIALS: translate("error.INVALID_CREDENTIALS"),
  USERNAME_UNAVAILABLE: translate("error.USERNAME_UNAVAILABLE"),
  INVALID_USERNAME: translate("error.INVALID_USERNAME"),
  INVALID_PASSWORD_LENGTH: translate("error.INVALID_PASSWORD_LENGTH"),
  ROOM_FULL: translate("error.ROOM_FULL"),
  ROOM_PARTICIPATION_LIMIT: translate("error.ROOM_PARTICIPATION_LIMIT"),
  ROOM_REOPEN_LIMIT: translate("error.ROOM_REOPEN_LIMIT"),
  NOT_READY: translate("error.NOT_READY"),
  REVISION_CONFLICT: translate("error.REVISION_CONFLICT"),
  PENDING_CHOICES: translate("error.PENDING_CHOICES"),
  NOT_YOUR_TURN: translate("error.NOT_YOUR_TURN"),
  INSUFFICIENT_RESOURCES: translate("error.INSUFFICIENT_RESOURCES"),
  INSUFFICIENT_POWER: translate("error.INSUFFICIENT_POWER"),
  OUT_OF_REACH: translate("error.OUT_OF_REACH"),
  OCCUPIED: translate("error.OCCUPIED"),
  NOT_NATIVE_TERRAIN: translate("error.NOT_NATIVE_TERRAIN"),
  PRIMARY_ALREADY_USED: translate("error.PRIMARY_ALREADY_USED"),
  PRIMARY_REQUIRED: translate("error.PRIMARY_REQUIRED"),
  FORBIDDEN: translate("error.FORBIDDEN"),
  INVALID_INVITE: translate("error.INVALID_INVITE"),
  UNAUTHENTICATED: translate("error.UNAUTHENTICATED"),
  BONUS_UNAVAILABLE: translate("error.BONUS_UNAVAILABLE"),
  INVALID_UPGRADE: translate("error.INVALID_UPGRADE"),
  UNSUPPORTED_ABILITY: translate("error.UNSUPPORTED_ABILITY"),
  UNSUPPORTED_ACTION: translate("error.UNSUPPORTED_ACTION"),
  BOOK_PAYMENT: translate("error.BOOK_PAYMENT"),
  RATE_LIMIT: translate("error.RATE_LIMIT"),
  NETWORK_ERROR: translate("error.NETWORK_ERROR"),
  RULESET_UNAVAILABLE: translate("error.RULESET_UNAVAILABLE"),
  RESOLVE_KEY_FIRST: translate("error.RESOLVE_KEY_FIRST"),
  RESOLVE_NEUTRAL_FIRST: translate("error.RESOLVE_NEUTRAL_FIRST"),
  WAIT_SCIENCE_ORDER: translate("error.WAIT_SCIENCE_ORDER"),
  NO_CITY_KEY: translate("error.NO_CITY_KEY"),
};
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new RequestError("NETWORK_ERROR");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    // The command may already have committed before a proxy replaced its response.
    throw new RequestError("NETWORK_ERROR");
  }
  if (response.status >= 500 && data?.error !== "RULESET_UNAVAILABLE")
    throw new RequestError("NETWORK_ERROR");
  if (!response.ok) throw new RequestError(data.error ?? "SERVER_ERROR");
  return data;
}
export const names: Record<string, string> = {
  discard: translate("label.discard"),
  spades: translate("label.spades"),
  "income-tool-science": translate("label.income-tool-science"),
  "two-spades": translate("label.two-spades"),
  "scholar-score": translate("label.scholar-score"),
  "border-score": translate("label.border-score"),
  annexes: translate("label.annexes"),
  "power-special": translate("label.power-special"),
  "city-pass": translate("label.city-pass"),
  "min-science-pass": translate("label.min-science-pass"),
  forest: translate("label.forest"),
  lake: translate("label.lake"),
  mountain: translate("label.mountain"),
  desert: translate("label.desert"),
  plains: translate("label.plains"),
  swamp: translate("label.swamp"),
  wasteland: translate("label.wasteland"),
  river: translate("label.river"),
  workshop: translate("label.workshop"),
  guild: translate("label.guild"),
  school: translate("label.school"),
  palace: translate("label.palace"),
  university: translate("label.university"),
  tower: translate("label.tower"),
  monument: translate("label.monument"),
  blessed: translate("label.blessed"),
  navigators: translate("label.navigators"),
  goblins: translate("label.goblins"),
  coins: translate("label.coins"),
  power: translate("label.power"),
  scholar: translate("label.scholar"),
  bigbuilding: translate("label.bigbuilding"),
  "workshop-score": translate("label.workshop-score"),
  "city-discount": translate("label.city-discount"),
  "income-vp-coins": translate("label.income-vp-coins"),
  "income-book-power": translate("label.income-book-power"),
  "immediate-resources": translate("label.immediate-resources"),
  "immediate-score": translate("label.immediate-score"),
  "school-pass": translate("label.school-pass"),
  "power-books": translate("label.power-books"),
  libraries: translate("label.libraries"),
  census: translate("label.census"),
  communications: translate("label.communications"),
  steel: translate("label.steel"),
  architecture: translate("label.architecture"),
  colleges: translate("label.colleges"),
  sewerage: translate("label.sewerage"),
  "league-of-cities": translate("label.league-of-cities"),
  tools: translate("label.tools"),
  books: translate("label.books"),
  science: translate("label.science"),
};
export const label = (id: string): string => {
  const source =
    /^(palace|innovation|competency|bonus|city|faction):(.+)$/.exec(id);
  if (source)
    return source[1] === "faction"
      ? label(source[2])
      : tileCode(source[1], source[2]);
  if (id.startsWith("城市板块：")) return tileCode("city", id.slice(5));
  return (
    factions[id]?.name ??
    palaces[id]?.name ??
    innovations[id]?.name ??
    (id !== "tower" ? competencyCodes[id] : undefined) ??
    names[id] ??
    bonusCodes[id] ??
    translateRuleText(id)
  );
};
