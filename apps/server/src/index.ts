import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { Pool, migrate } from "./db/pool";
import { createApp } from "./app";
import { configuredMailer } from "./mail/transport";
import { startMailWorker } from "./mail/worker";
if (existsSync(".env")) loadEnvFile(".env");
if (!process.env.DATABASE_URL)
  throw Error(
    "DATABASE_URL is required. See .env.example and docs/operations/local.md",
  );
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const production = process.env.NODE_ENV === "production";
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5173";
const additionalOrigins = (process.env.ADDITIONAL_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (
  production &&
  [origin, ...additionalOrigins].some(
    (value) => new URL(value).protocol !== "https:",
  )
)
  throw Error("Production APP_ORIGIN must use HTTPS");
await migrate(db);
const mailer = configuredMailer();
const app = createApp(
  db,
  origin,
  production,
  (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  additionalOrigins,
  mailer,
);
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "127.0.0.1" });
console.log(`cellman API: http://127.0.0.1:${process.env.PORT ?? 3001}`);
const stopMail = startMailWorker(db, mailer, origin);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await stopMail();
    await app.close();
    await db.end();
    process.exit(0);
  });
