import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import * as content from "../packages/rules/src/content.ts";

const root = resolve("apps/web/src");
const catalogPath = resolve(root, "i18n/locales/zh-CN.json");
const sourcePath = resolve(root, "i18n/sources.json");
const messages = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, "utf8"))
  : {};
const sources = existsSync(sourcePath)
  ? JSON.parse(readFileSync(sourcePath, "utf8"))
  : {};
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const chinese = /[\u3400-\u9fff]/;
const terms = {
  "term.building.guild": ["公会", "商会"],
  "term.building.school": ["学院", "学校"],
  "term.building.palace": ["宫殿", "宫殿"],
  "term.building.tower": ["灯塔", "塔楼"],
  "term.power": ["能量", "魔力"],
  "term.science": ["科学", "学科"],
  "term.innovation": ["革新", "创新"],
  "term.sailing": ["航海", "航运", "航行"],
  "term.palaceAbility": ["宫殿能力", "要塞技能"],
  "term.faction.blessed": ["天佑者", "受祝福者"],
  "term.faction.felines": ["猫人", "猫族"],
  "term.faction.monks": ["僧侣", "修道士"],
  "term.faction.psychics": ["通灵者", "灵能者"],
  "term.faction.omar": ["奥尔马", "奥玛族", "奥玛"],
};
for (const [key, [value]] of Object.entries(terms)) messages[key] ??= value;
const replacements = Object.entries(terms)
  .flatMap(([key, [, ...aliases]]) => aliases.map((a) => [a, `{{${key}}}`]))
  .sort((a, b) => b[0].length - a[0].length);
function translatedDefault(text) {
  const pattern = new RegExp(replacements.map(([s]) => s).join("|"), "g");
  return text.replace(
    pattern,
    (match) => replacements.find(([s]) => s === match)[1],
  );
}
function add(key, text, file, line) {
  messages[key] ??= translatedDefault(text);
  sources[key] = { text, file, ...(line ? { line } : {}) };
  return key;
}
for (const [category, definitions] of Object.entries({
  faction: content.factions,
  palace: content.palaces,
  innovation: content.innovations,
}))
  for (const [id, d] of Object.entries(definitions))
    for (const field of category === "faction"
      ? ["name", "description"]
      : ["description"])
      add(
        `content.${category}.${id}.${field}`,
        d[field],
        "packages/rules/src/content.ts",
      );
for (const [id, text] of Object.entries(content.bonusDescriptions))
  add(`content.bonus.${id}.description`, text, "packages/rules/src/content.ts");

function jsxText(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  let last = 0;
  lines.forEach((line, i) => {
    if (/[^ \t]/.test(line)) last = i;
  });
  return lines
    .map((line, i) => {
      let s = line.replace(/\t/g, " ");
      if (i !== 0) s = s.replace(/^ +/, "");
      if (i !== lines.length - 1) s = s.replace(/ +$/, "");
      return s && i !== last ? s + " " : s;
    })
    .join("");
}
function migrate(path) {
  const source = readFileSync(path, "utf8");
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const scope = relative(root, path)
    .replaceAll("\\", "/")
    .replace(/\.tsx?$/, "")
    .replaceAll("/", ".");
  let count = 0;
  function key(text, node) {
    let name = `ui.${scope}.${hash(text)}`;
    if (
      scope === "api" &&
      ts.isPropertyAssignment(node.parent) &&
      node.parent.initializer === node
    ) {
      let parent = node.parent;
      while (parent && !ts.isVariableDeclaration(parent))
        parent = parent.parent;
      if (parent?.name?.getText(file) === "messages")
        name = `error.${node.parent.name.getText(file).replaceAll('"', "")}`;
      if (parent?.name?.getText(file) === "names")
        name = `label.${node.parent.name.getText(file).replaceAll('"', "")}`;
    }
    return add(
      name,
      text,
      relative(resolve("."), path).replaceAll("\\", "/"),
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    );
  }
  function render(node) {
    const start = node.getStart(file),
      end = node.end;
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isTypeNode(node)
    )
      return source.slice(start, end);
    // Serialized identifiers and protocol recognition are deliberately not translated.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["startsWith", "endsWith"].includes(node.expression.name.text)
    )
      return source.slice(start, end);
    if (
      ts.isJsxAttribute(node) &&
      ["value", "key", "id"].includes(node.name.getText(file))
    )
      return source.slice(start, end);
    if (ts.isJsxText(node) && chinese.test(node.text)) {
      count++;
      return `{translate(${JSON.stringify(key(jsxText(node.text), node))})}`;
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      chinese.test(node.text)
    ) {
      if (
        (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
        ts.isLiteralTypeNode(node.parent)
      )
        return source.slice(start, end);
      count++;
      const result = `translate(${JSON.stringify(key(node.text, node))})`;
      return ts.isJsxAttribute(node.parent) ? `{${result}}` : result;
    }
    if (
      ts.isTemplateExpression(node) &&
      chinese.test(
        node.head.text + node.templateSpans.map((s) => s.literal.text).join(""),
      )
    ) {
      count++;
      const message =
        node.head.text +
        node.templateSpans.map((s, i) => `{p${i}}${s.literal.text}`).join("");
      const params = node.templateSpans
        .map((s, i) => `p${i}: ${render(s.expression)}`)
        .join(", ");
      return `translate(${JSON.stringify(key(message, node))}, { ${params} })`;
    }
    const edits = [];
    ts.forEachChild(node, (child) => {
      const next = render(child);
      const a = child.getStart(file),
        b = child.end;
      if (next !== source.slice(a, b)) edits.push({ a, b, next });
    });
    let result = source.slice(start, end);
    for (const e of edits.sort((a, b) => b.a - a.a))
      result =
        result.slice(0, e.a - start) + e.next + result.slice(e.b - start);
    return result;
  }
  const edits = [];
  file.forEachChild((node) => {
    const next = render(node);
    if (next !== node.getText(file))
      edits.push({ start: node.getStart(file), end: node.end, next });
  });
  if (!count) return 0;
  if (process.argv.includes("--check")) {
    console.error(`${path}: ${count} untranslated source strings`);
    return count;
  }
  let result = source;
  for (const e of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, e.start) + e.next + result.slice(e.end);
  const importPath = scope.startsWith("i18n.") ? "./index" : "./i18n";
  if (!result.includes("t as translate"))
    result =
      `import { t as translate } from ${JSON.stringify(importPath)};\n` +
      result;
  writeFileSync(path, result);
  return count;
}
let count = 0;
for (const f of readdirSync(root).filter((f) => /\.tsx?$/.test(f)))
  count += migrate(resolve(root, f));
for (const f of ["content.ts", "presentation.ts", "time.ts", "language.tsx"])
  if (existsSync(resolve(root, "i18n", f)))
    count += migrate(resolve(root, "i18n", f));

// Historical engine text remains unchanged in persisted records. Translate it at display time.
const ruleMessages = [];
function readRuleMessages(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      readRuleMessages(path);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    const source = readFileSync(path, "utf8"),
      file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      let text;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        text = node.text;
      else if (ts.isTemplateExpression(node))
        text =
          node.head.text +
          node.templateSpans.map((s, i) => `{p${i}}${s.literal.text}`).join("");
      if (text && chinese.test(text)) {
        const key = add(
          `rules.${hash(text)}`,
          text,
          relative(resolve("."), path).replaceAll("\\", "/"),
        );
        if (!ruleMessages.some((m) => m.source === text))
          ruleMessages.push({ source: text, key });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
}
if (!process.argv.includes("--check")) {
  readRuleMessages(resolve("packages/rules/src"));
  const sorted = (object) =>
    Object.fromEntries(
      Object.entries(object).sort(([a], [b]) => a.localeCompare(b)),
    );
  writeFileSync(catalogPath, JSON.stringify(sorted(messages), null, 2) + "\n");
  writeFileSync(sourcePath, JSON.stringify(sorted(sources), null, 2) + "\n");
  writeFileSync(
    resolve(root, "i18n/rule-messages.json"),
    JSON.stringify(ruleMessages, null, 2) + "\n",
  );
  console.log(
    `Extracted ${count} strings; ${Object.keys(messages).length} catalog entries.`,
  );
} else if (count) process.exitCode = 1;
