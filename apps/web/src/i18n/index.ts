import zhCN from "./locales/zh-CN.json" with { type: "json" };
import { createTranslator } from "./core";
// Register complete locale dictionaries here. Missing entries fall back to Chinese.
// Locale changes reload the app so module-level labels also refresh consistently.
export const i18n = createTranslator({ "zh-CN": zhCN });
try {
  i18n.setLocale(
    typeof localStorage === "undefined"
      ? "zh-CN"
      : (localStorage.getItem("cellman-locale") ?? "zh-CN"),
  );
} catch {
  /* Browser storage may be unavailable. */
}
export const t = i18n.t;
if (typeof document !== "undefined")
  document.documentElement.lang = i18n.getLocale();
export function setLocale(locale: string) {
  i18n.setLocale(locale);
  try {
    localStorage.setItem("cellman-locale", i18n.getLocale());
  } catch {
    /* Translation still works without storage. */
  }
  if (typeof window !== "undefined") window.location.reload();
}
