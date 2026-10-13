import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { Pool, migrate } from "./db/pool";
import { createApp } from "./app";
if (existsSync(".env")) loadEnvFile(".env");
if (!process.env.DATABASE_URL)
  throw Error(
    "DATABASE_URL is required. See .env.example and docs/operations/local.md",
  );
const db = new Pool({ connectionString: process.env.DATABASE_URL });
await migrate(db);
const app = createApp(
  db,
  process.env.APP_ORIGIN ?? "http://127.0.0.1:5173",
  process.env.NODE_ENV === "production",
);
await app.listen({ port: Number(process.env.PORT ?? 3001), host: "127.0.0.1" });
console.log("BoardGame API: http://127.0.0.1:3001");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
