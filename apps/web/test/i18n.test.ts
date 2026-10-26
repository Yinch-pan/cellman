import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { createTranslator } from "../src/i18n/core";
import zh from "../src/i18n/locales/zh-CN.json";
import sources from "../src/i18n/sources.json";
import { label } from "../src/api";
import {
  palaceCodes,
  competencyCodes,
  bonusCodes,
  innovationCodes,
} from "../src/i18n/tile-codes";
import * as raw from "../../../packages/rules/src/content";
import * as content from "../src/i18n/content";
import { competencyIds } from "../../../packages/rules/src/catalog";
import { actionState } from "../../../packages/rules/test/fixtures/actions";
import { specialOptions as rawSpecial } from "../../../packages/rules/src/actions/special";
import { incomeSources as rawIncome } from "../../../packages/rules/src/income";
import {
  specialOptions,
  incomeSources,
  eventText,
} from "../src/i18n/presentation";
import { ledgerEntry } from "../../../packages/rules/src/ledger";

describe("translation catalogs", () => {
  it("resolves every literal translation key used by the web UI", () => {
    const visitDirectory = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
          visitDirectory(path);
          continue;
        }
        if (!/\.tsx?$/.test(path)) continue;
        const source = ts.createSourceFile(
          path,
          readFileSync(path, "utf8"),
          ts.ScriptTarget.Latest,
          true,
          path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        );
        const visit = (node: ts.Node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            ["t", "translate"].includes(node.expression.text) &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          ) {
            expect(
              Object.hasOwn(zh, node.arguments[0].text),
              `${path}: ${node.arguments[0].text}`,
            ).toBe(true);
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    };
    visitDirectory(resolve("apps/web/src"));
  });
  it("switches locale, falls back and treats inserted names literally", () => {
    const i = createTranslator({
      "zh-CN": {
        term: "能量",
        text: "{name}：{{term}} {count}",
        fallback: "默认",
      },
      en: { term: "Power" },
    });
    i.setLocale("en");
    expect(i.t("text", { name: "魔力{{term}}{count}", count: 3 })).toBe(
      "魔力{{term}}{count}：Power 3",
    );
    expect(i.t("fallback")).toBe("默认");
    expect(i.t("missing")).toBe("missing");
    i.setLocale("unknown");
    expect(i.getLocale()).toBe("zh-CN");
    expect(() =>
      createTranslator({ "zh-CN": { a: "{{b}}", b: "{{a}}" } }).t("a"),
    ).toThrow("Circular");
  });
  it("has valid references and preserves extracted parameters", () => {
    const t = createTranslator({ "zh-CN": zh }).t;
    for (const [key, value] of Object.entries(zh)) {
      for (const [, ref] of value.matchAll(/\{\{([^{}]+)\}\}/g))
        expect(Object.hasOwn(zh, ref), `${key}: ${ref}`).toBe(true);
      expect(t(key), key).not.toContain("{{");
      const source = (sources as Record<string, { text: string }>)[key];
      if (source)
        expect(
          [...value.matchAll(/\{p\d+\}/g)].map((m) => m[0]).sort(),
          key,
        ).toEqual(
          [...source.text.matchAll(/\{p\d+\}/g)].map((m) => m[0]).sort(),
        );
    }
  });
});

describe("stable tile codes", () => {
  it("covers all tiles and keeps ambiguous categories separate", () => {
    for (const [codes, ids] of [
      [palaceCodes, Object.keys(raw.palaces)],
      [innovationCodes, Object.keys(raw.innovations)],
      [bonusCodes, raw.bonusIds],
      [competencyCodes, competencyIds],
    ] as const) {
      expect(Object.keys(codes).sort()).toEqual([...ids].sort());
      expect(new Set(Object.values(codes)).size).toBe(ids.length);
    }
    expect(label("palace:tools-special")).toBe("SH1");
    expect(label("palace:remote-guild")).toBe("SH16");
    expect(label("palace:immediate-score")).toBe("SH-X1");
    expect(label("competency:border-score")).toBe("FAV10");
    expect(label("competency:tower")).toBe("FAV1");
    expect(label("tower")).toBe("灯塔");
    expect(label("guild")).toBe("公会");
    expect(label("bonus:guild")).toBe("BON-P3");
    expect(label("coins")).toBe("金币");
    expect(label("bonus:coins")).toBe("BON10");
  });
  it("matches BGA's numbered scoring effects and keeps unverified bonuses distinct", () => {
    expect(competencyCodes).toMatchObject({
      "min-science-pass": "FAV4",
      "city-pass": "FAV5",
      "scholar-score": "FAV8",
      "income-vp-coins": "FAV9",
      "border-score": "FAV10",
      "immediate-resources": "FAV11",
    });
    expect(bonusCodes).toMatchObject({
      "spade-bonus": "BON5",
      "science-bonus": "BON7",
      school: "BON8",
      power: "BON9",
      coins: "BON10",
    });
    expect(content.innovations["neutral-university"].name).toBe("E14");
    for (const id of [
      "guild",
      "scholar",
      "bigbuilding",
      "river",
      "bridge-bonus",
    ])
      expect(bonusCodes[id]).toMatch(/^BON-P\d+$/);
  });
  it("preserves special commands, income and persisted state", () => {
    const state = actionState();
    const player = state.players.p1;
    player.bonus = "spade-bonus";
    player.name = "商会魔力{{term.power}}";
    const snapshot = JSON.stringify(state);
    const stripLabel = ({ label: _, ...rest }: { label: string }) => rest;
    expect(specialOptions(player).map(stripLabel)).toEqual(
      rawSpecial(player).map(stripLabel),
    );
    expect(
      specialOptions(player).find((o) => o.id === "bonus:spade-bonus")?.label,
    ).toMatch(/^BON5 · /);
    expect(
      incomeSources(state, player).map(({ source: _, ...r }) => r),
    ).toEqual(rawIncome(state, player).map(({ source: _, ...r }) => r));
    const event = ledgerEntry(state, state, "p1", { kind: "burn", count: 1 });
    const original = event.text;
    expect(eventText(event, state)).toBe("商会魔力{{term.power}}：燃烧能量");
    expect(event.text).toBe(original);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(content.palaces["tools-special"].name).toBe("SH1");
    expect(raw.palaces["tools-special"].name).not.toBe("SH1");
  });
});
