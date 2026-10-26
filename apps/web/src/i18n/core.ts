export type Messages = Record<string, string>;
export type Parameters = Record<string, unknown>;

/** Locale dictionaries contain strings, never HTML or executable expressions. */
export function createTranslator(
  catalogs: Record<string, Messages>,
  fallback = "zh-CN",
) {
  let locale = fallback;
  const translate = (
    key: string,
    parameters: Parameters = {},
    stack: string[] = [],
  ): string => {
    if (stack.includes(key))
      throw new Error(
        `Circular translation reference: ${[...stack, key].join(" -> ")}`,
      );
    const message = catalogs[locale]?.[key] ?? catalogs[fallback]?.[key] ?? key;
    const resolved = message.replace(
      /\{\{([^{}]+)\}\}/g,
      (_, reference: string) => translate(reference, {}, [...stack, key]),
    );
    // Replace once so player names and other interpolated values are never interpreted as messages.
    return resolved.replace(/\{([A-Za-z][\w]*)\}/g, (token, name: string) =>
      Object.hasOwn(parameters, name) ? String(parameters[name] ?? "") : token,
    );
  };
  return {
    t: translate,
    getLocale: () => locale,
    setLocale: (next: string) => {
      locale = Object.hasOwn(catalogs, next) ? next : fallback;
    },
    locales: Object.keys(catalogs),
  };
}
