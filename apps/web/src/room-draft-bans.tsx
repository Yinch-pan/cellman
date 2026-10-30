import React from "react";
import { t } from "./i18n";
import { label } from "./api";
import { factions, palaces, bonusDescriptions } from "./i18n/content";
import { bonusCodes } from "./i18n/tile-codes";
import {
  draftCategories,
  draftCatalog,
  draftPoolSizes,
  emptyDraftBans,
  type DraftBans,
  type DraftCategory,
} from "../../../packages/rules/src/draft-bans";
import "./room-draft-bans.css";

const categoryName = (category: DraftCategory) =>
  t(`draftBan.category.${category}`);
export const draftBanName = (category: DraftCategory, id: string) =>
  category === "bonus" ? bonusCodes[id] : label(id);
const description = (category: DraftCategory, id: string) =>
  category === "faction"
    ? factions[id].description
    : category === "palace"
      ? palaces[id].description
      : category === "bonus"
        ? bonusDescriptions[id]
        : "";

export function DraftBanSummary({ value }: { value?: DraftBans }) {
  const bans = value ?? emptyDraftBans();
  const selected = draftCategories.filter((category) => bans[category].length);
  return (
    <div className="draft-ban-summary" aria-label={t("draftBan.summary")}>
      <strong>{t("draftBan.title")}</strong>
      {selected.length ? (
        selected.map((category) => (
          <p key={category}>
            {categoryName(category)}：
            {bans[category].map((id) => draftBanName(category, id)).join("、")}
          </p>
        ))
      ) : (
        <p className="muted">{t("draftBan.empty")}</p>
      )}
    </div>
  );
}

export function DraftBanEditor({
  value,
  players,
  onChange,
}: {
  value?: DraftBans;
  players: number;
  onChange: (bans: DraftBans) => void;
}) {
  const bans = value ?? emptyDraftBans(),
    sizes = draftPoolSizes(players);
  return (
    <section className="draft-ban-editor" aria-label={t("draftBan.title")}>
      <div className="section-heading">
        <h3>{t("draftBan.title")}</h3>
        <button
          type="button"
          className="text-button"
          disabled={draftCategories.every((c) => !bans[c].length)}
          onClick={() => onChange(emptyDraftBans())}
        >
          {t("draftBan.clear")}
        </button>
      </div>
      <p className="muted">{t("draftBan.help")}</p>
      {draftCategories
        .filter(
          (category) =>
            bans[category].length >
            draftCatalog[category].length - sizes[category],
        )
        .map((category) => (
          <p key={category} role="alert" className="error">
            {t("draftBan.tooMany", {
              category: categoryName(category),
              count:
                bans[category].length -
                draftCatalog[category].length +
                sizes[category],
            })}
          </p>
        ))}
      {draftCategories.map((category) => {
        const maximum = draftCatalog[category].length - sizes[category];
        return (
          <details className="draft-ban-category" key={category}>
            <summary>
              {categoryName(category)} ·{" "}
              {t("draftBan.count", {
                selected: bans[category].length,
                maximum,
              })}
            </summary>
            <p className="muted">
              {t("draftBan.pool", { count: sizes[category] })}
            </p>
            <div className="draft-ban-grid">
              {draftCatalog[category].map((id) => {
                const checked = bans[category].includes(id);
                const disabled = !checked && bans[category].length >= maximum;
                return (
                  <label
                    key={id}
                    className={`draft-ban-card${checked ? " banned" : ""}${disabled ? " unavailable" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      aria-label={t("draftBan.toggle", {
                        name: draftBanName(category, id),
                      })}
                      onChange={() =>
                        onChange({
                          ...bans,
                          [category]: checked
                            ? bans[category].filter((v) => v !== id)
                            : [...bans[category], id],
                        })
                      }
                    />
                    <span>
                      <strong>{draftBanName(category, id)}</strong>
                      {description(category, id) && (
                        <small>{description(category, id)}</small>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </section>
  );
}
