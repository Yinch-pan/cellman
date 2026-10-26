import { t as translate } from "./index";
import type { GameSettings } from "../../../../packages/contracts/src/room";
export function durationLabel(hours: number) {
  return hours % 24 === 0
    ? translate("ui.i18n.time.40e0240cab", { p0: hours / 24 })
    : translate("ui.i18n.time.f34c8f0bb4", { p0: hours });
}
export function setupLabel(mode: string) {
  return mode === "snake-forward"
    ? translate("ui.i18n.time.81dc8bf7f7")
    : mode === "snake-reverse"
      ? translate("ui.i18n.time.e1e8017dd3")
      : mode === "training"
        ? translate("ui.i18n.time.532873fd3c")
        : translate("ui.i18n.time.68135c58fd");
}
export function timeLabel(time: GameSettings["time"]) {
  if (time.mode === "incremental")
    return translate("ui.i18n.time.79a20960b3", {
      p0: durationLabel(time.initialHours),
      p1: durationLabel(time.incrementHours),
      p2: durationLabel(time.maximumHours),
    });
  if (time.mode === "paced") {
    const speed =
      time.movesPerDay === 0.5
        ? translate("ui.i18n.time.f7118396c9")
        : translate("ui.i18n.time.685f85bfc5", { p0: time.movesPerDay });
    const start = (time.activeStartUtc + 8) % 24;
    return (
      speed +
      (time.movesPerDay >= 8
        ? translate("ui.i18n.time.2d6c57c639", {
            p0: String(start).padStart(2, "0"),
            p1: String((start + 12) % 24).padStart(2, "0"),
          })
        : "")
    );
  }
  return time.mode === "none"
    ? translate("ui.i18n.time.667561eac3")
    : time.mode === "bank"
      ? translate("ui.i18n.time.402b837b8c", { p0: time.minutes })
      : translate("ui.i18n.time.a0f59c549a", { p0: time.hours });
}
