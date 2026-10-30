import React, { useEffect, useRef, useState } from "react";
import type {
  BuildingKind,
  GameAction,
  GameState,
} from "../../../packages/rules/src/types";
import { applyAction } from "../../../packages/rules/src/engine";
import { officialLarge } from "../../../packages/rules/src/map";
import { label, RequestError } from "./api";
import { palaces } from "./i18n/content";
import { t } from "./i18n";
import { hexLabel } from "./map-coordinates";
import { usesCurrentActionProtocol } from "../../../packages/rules/src/state";

export type MapAnchor = { x: number; y: number };

/** Offers are validated by the same versioned engine as normal previews. */
export function mapActions(state: GameState, seat: string, hex: string) {
  const player = state.players[seat],
    building = state.board.buildings[hex];
  const offers: { title: string; action: GameAction; description?: string }[] =
    [];
  if (
    state.status !== "active" ||
    state.phase !== "actions" ||
    state.activeSeat !== seat ||
    state.pending.length ||
    player.primaryDone
  )
    return offers;
  if (building) {
    if (building.seat !== seat || building.neutral) return offers;
    const paths: Partial<Record<BuildingKind, BuildingKind[]>> = {
      workshop: ["guild"],
      guild: ["school", "palace"],
      school: ["university"],
    };
    for (const to of paths[building.kind] ?? []) {
      if (to === "palace") {
        if (usesCurrentActionProtocol(state.rulesVersion) && !player.draftPalace) {
          offers.push({
            title: t("mapAction.upgrade", { building: label(to) }),
            description: t("palace.afterLeech"),
            action: { kind: "upgrade", hex, to, deferPalace: true },
          });
          continue;
        }
        for (const palace of player.draftPalace
          ? [player.draftPalace]
          : state.shared.palaces)
          offers.push({
            title: t("mapAction.upgradePalace", {
              code: label(`palace:${palace}`),
            }),
            action: { kind: "upgrade", hex, to, palace },
            description: palaces[palace]?.description,
          });
      } else
        offers.push({
          title: t("mapAction.upgrade", { building: label(to) }),
          action: {
            kind: "upgrade",
            hex,
            to,
            ...(["school", "university"].includes(to) &&
            usesCurrentActionProtocol(state.rulesVersion)
              ? { deferCompetency: true }
              : {}),
          },
        });
    }
  } else {
    const terrain =
      state.board.terrain[hex] ?? officialLarge.hexes[hex]?.terrain;
    if (!terrain || terrain === "river") return offers;
    if (terrain !== player.native && usesCurrentActionProtocol(state.rulesVersion)) {
      offers.push({
        title: t("mapAction.terraformOnly"),
        description: t("mapAction.buildLater"),
        action: {
          kind: "terraform",
          hex,
          terrain: player.native,
          build: false,
          deferBuild: true,
        },
      });
      return offers;
    }
    offers.push({
      title: t(
        terrain === player.native
          ? "mapAction.build"
          : "mapAction.terraformBuild",
      ),
      action: { kind: "terraform", hex, terrain: player.native, build: true },
    });
    if (terrain !== player.native)
      offers.push({
        title: t("mapAction.terraformOnly"),
        description: t("mapAction.buildLater"),
        action: {
          kind: "terraform",
          hex,
          terrain: player.native,
          build: false,
          deferBuild: true,
        },
      });
  }
  return offers;
}

export function MapActionPanel({
  state,
  seat,
  hex,
  anchor,
  busy,
  locked,
  error,
  preview,
  onPreview,
  onClose,
  onDetails,
}: {
  state: GameState;
  seat: string;
  hex: string;
  anchor: MapAnchor;
  busy: boolean;
  locked: boolean;
  error: string;
  preview: React.ReactNode;
  onPreview: (action: GameAction) => void;
  onClose: () => void;
  onDetails: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [hex, preview ? "preview" : "choices"]);
  useEffect(() => {
    if (busy || locked) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !ref.current?.contains(target) &&
        !target.closest(".map-frame, [data-map-preview]")
      )
        close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        document
          .querySelector<SVGGElement>('.hex[aria-pressed="true"]')
          ?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [busy, locked]);
  const offers = mapActions(state, seat, hex),
    player = state.players[seat],
    building = state.board.buildings[hex];
  const width = Math.min(370, viewport.width - 24);
  const left = Math.max(
    12,
    Math.min(anchor.x + 12, viewport.width - width - 12),
  );
  const top = Math.max(80, Math.min(anchor.y, viewport.height - 460));
  return (
    <section
      ref={ref}
      className="map-context-panel"
      role="region"
      aria-label={t("mapAction.label")}
      tabIndex={-1}
      style={
        {
          left,
          top,
          width,
          "--map-panel-top": `${top}px`,
        } as React.CSSProperties
      }
    >
      <header>
        <div>
          <strong>
            {hexLabel(hex)} ·{" "}
            {label(
              state.board.terrain[hex] ?? officialLarge.hexes[hex]?.terrain,
            )}
          </strong>
          <small>
            {building
              ? `${state.players[building.seat]?.name} · ${label(building.kind)}`
              : t("mapAction.empty")}
          </small>
        </div>
        <button
          type="button"
          className="text-button"
          disabled={busy || locked}
          onClick={onClose}
          aria-label={t("mapAction.close")}
        >
          ×
        </button>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview || (
        <>
          <p className="small muted">{t("mapAction.instructions")}</p>
          {!offers.length && (
            <p>
              {t(
                building?.seat !== seat
                  ? "mapAction.otherPlayer"
                  : building?.neutral
                    ? "mapAction.neutral"
                    : "mapAction.noUpgrade",
              )}
            </p>
          )}
          <div className="map-context-options">
            {offers.map(({ title, action, description }, index) => {
              const result = applyAction(state, seat, action);
              const next = result.ok ? result.state.players[seat] : null;
              const changes = next
                ? ["coins", "tools", "scholars"].flatMap((key) => {
                    const before =
                        player.resources[key as "coins" | "tools" | "scholars"],
                      after =
                        next.resources[key as "coins" | "tools" | "scholars"];
                    return before === after
                      ? []
                      : [
                          `${label(key === "scholars" ? "scholar" : key)} ${before} → ${after}`,
                        ];
                  })
                : [];
              return (
                <button
                  className="map-context-option"
                  key={index}
                  disabled={busy || !result.ok}
                  onClick={() => onPreview(action)}
                >
                  <strong>{title}</strong>
                  {description && <small>{description}</small>}
                  <small>
                    {result.ok
                      ? t("mapAction.balances", {
                          changes: changes.join(" · ") || t("mapAction.noCost"),
                        })
                      : new RequestError(result.error.code).message}
                  </small>
                  {next && next.vp !== player.vp && (
                    <small>
                      {t("mapAction.score", {
                        before: player.vp,
                        after: next.vp,
                      })}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <button
            className="text-button full"
            onClick={onDetails}
            disabled={busy}
          >
            {t("mapAction.details")}
          </button>
          <p className="small muted">{t("mapAction.changeHex")}</p>
        </>
      )}
    </section>
  );
}
