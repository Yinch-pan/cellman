import React from "react";
import { i18n, setLocale, t } from "./index";
export function LanguageSelector() {
  if (i18n.locales.length < 2) return null;
  return (
    <select
      aria-label={t("language.label")}
      value={i18n.getLocale()}
      onChange={(e) => setLocale(e.target.value)}
    >
      {i18n.locales.map((locale) => (
        <option key={locale} value={locale}>
          {new Intl.DisplayNames([locale], { type: "language" }).of(locale) ??
            locale}
        </option>
      ))}
    </select>
  );
}
