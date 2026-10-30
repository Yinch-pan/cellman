// Windows task entry. Private config (including SMTP) is passed through stdin
// after DPAPI decryption; status and stdout never contain credentials.
import { readFile, writeFile, mkdir, stat, readdir, rename, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { connect } from "node:tls";
import { isIP } from "node:net";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validBackup, alertDue } from "./ops-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let input = "";
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
if (!/^[a-zA-Z0-9.-]+$/.test(config.host) || !/^[a-zA-Z0-9_-]+$/.test(config.user))
  throw Error("Invalid SSH destination");
const stateFile = join(config.stateDir, "status.json");
await mkdir(config.backupDir, { recursive: true });
let previous = {};
try { previous = JSON.parse(await readFile(stateFile, "utf8")); } catch {}
const now = Date.now() / 1000;
const warnings = [];
const status = { at: new Date().toISOString(), warnings };

async function hash(path) {
  const digest = createHash("sha256");
  for await (const data of createReadStream(path)) digest.update(data);
  return digest.digest("hex");
}

for (const route of ["/api/health", "/api/auth/mail-status"]) {
  try {
    const response = await fetch(config.origin + route, { signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (!response.ok || !(route.endsWith("health") ? body.ok : body.available)) throw Error();
  } catch { warnings.push("Public check failed: " + route); }
}
try {
  const url = new URL(config.origin);
  status.certificateExpires = await new Promise((done, fail) => {
    const socket = connect({ host: url.hostname, port: Number(url.port || 443),
      ...(isIP(url.hostname) ? {} : { servername: url.hostname }), rejectUnauthorized: true });
    socket.setTimeout(10000, () => socket.destroy(Error("TLS timeout")));
    socket.once("error", fail);
    socket.once("secureConnect", () => {
      const date = new Date(socket.getPeerCertificate().valid_to);
      socket.end();
      done(date.toISOString());
    });
  });
  if (Date.parse(status.certificateExpires) - Date.now() < 48 * 3600000)
    warnings.push("Public TLS certificate expires within 48 hours");
} catch { warnings.push("Public TLS certificate check failed"); }

try {
  const manifestCode = `import pathlib,hashlib,json\np=max(pathlib.Path('/var/backups/cellman').glob('cellman-*.dump'),key=lambda p:p.stat().st_mtime)\nwith p.open('rb') as f: h=hashlib.file_digest(f,'sha256').hexdigest()\nprint(json.dumps(dict(name=p.name,sha256=h,bytes=p.stat().st_size,mtime=p.stat().st_mtime)))\n`;
  const remote = spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=yes", `${config.user}@${config.host}`, "python3", "-"],
    { input: manifestCode, encoding: "utf8", timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
  if (remote.status !== 0) throw Error("SSH manifest unavailable");
  const manifest = JSON.parse(remote.stdout);
  if (!validBackup(manifest)) throw Error("Invalid backup manifest");
  const destination = join(config.backupDir, manifest.name);
  let valid = false;
  try { valid = (await stat(destination)).size === manifest.bytes && await hash(destination) === manifest.sha256; } catch {}
  if (!valid) {
    const temporary = destination + ".partial-" + randomUUID();
    try {
      const copied = spawnSync("scp", ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=yes",
        `${config.user}@${config.host}:/var/backups/cellman/${manifest.name}`, temporary],
        { encoding: "utf8", timeout: 180000, windowsHide: true });
      if (copied.status !== 0 || (await stat(temporary)).size !== manifest.bytes || await hash(temporary) !== manifest.sha256)
        throw Error("Backup transfer/checksum failed");
      await rename(temporary, destination);
    } finally { await unlink(temporary).catch(() => {}); }
  }
  await writeFile(destination + ".sha256", manifest.sha256 + "  " + manifest.name + "\n");
  status.backup = { name: manifest.name, sha256: manifest.sha256, bytes: manifest.bytes, sourceAt: manifest.mtime, verifiedAt: now };
  if (now - manifest.mtime > 36 * 3600) warnings.push("Server backup older than 36 hours");
  // Retain at least the newest verified dump; remove only our precisely named
  // regular dump files inside this configured backup directory after success.
  for (const entry of await readdir(config.backupDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^cellman-[A-Za-z0-9T-]+\.dump$/.test(entry.name) || entry.name === manifest.name) continue;
    const old = join(config.backupDir, entry.name);
    if (now - (await stat(old)).mtimeMs / 1000 > 30 * 86400) {
      await unlink(old);
      await unlink(old + ".sha256").catch(() => {});
    }
  }
} catch { warnings.push("Offsite backup pull or checksum verification failed; previous copies retained"); }

status.failureStreak = warnings.length ? (previous.failureStreak ?? 0) + 1 : 0;
for (const key of ["notifiedWarnings", "lastNotifiedAt", "lastAlertAttemptAt"])
  if (previous[key] !== undefined) status[key] = previous[key];
const test = process.argv.includes("--test-alert");
if (test || alertDue(warnings, previous, now)) {
  status.lastAlertAttemptAt = now;
  const message = { smtp: config.smtp, to: config.alertTo,
    subject: "[cellman external] " + (test ? "Monitoring enabled (test)" : warnings.length ? "Problem detected" : "Recovered"),
    text: status.at + "\n\n" + (test ? "External monitoring and checksum-verified backup pull are configured on your Windows development computer. This check only runs while that computer is on, connected, and the task can run.\n\n" : "") +
      (warnings.join("\n") || "All public checks and backup verification passed.") };
  const result = spawnSync(process.execPath, [join(root, "deploy/send-ops-alert.mjs")],
    { input: JSON.stringify(message), encoding: "utf8", timeout: 40000, windowsHide: true });
  status.alertDeliveredToSmtp = result.status === 0;
  if (result.status === 0) { status.notifiedWarnings = [...warnings]; status.lastNotifiedAt = now; }
}
await writeFile(stateFile + ".tmp", JSON.stringify(status, null, 2));
await rename(stateFile + ".tmp", stateFile);
console.log(JSON.stringify(status));
process.exitCode = warnings.length || status.alertDeliveredToSmtp === false ? 1 : 0;
