// Playwright-only server. There are no test fixture routes in the real API.
import { createServer } from "vite";
import { Pool, migrate } from "../../apps/server/src/db/pool";
import { createApp } from "../../apps/server/src/app";
const url = process.env.TEST_DATABASE_URL;
if (!url) throw Error("TEST_DATABASE_URL is required for browser tests");
const schema = process.env.E2E_SCHEMA;
if (!schema || !/^e2e_[a-f0-9]{32}$/.test(schema))
  throw Error("Invalid E2E schema");
if (url === process.env.DATABASE_URL)
  throw Error("Browser tests require a separate TEST_DATABASE_URL");
const admin = new Pool({ connectionString: url });
const db = new Pool({
  connectionString: url,
  options: `-c search_path=${schema}`,
});
await admin.query(`CREATE SCHEMA ${schema}`);
await migrate(db);
const api = createApp(db, "http://127.0.0.1:5174");
await api.listen({ port: 3002, host: "127.0.0.1" });
const web = await createServer({
  configFile: "apps/web/vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3002" },
  },
});
await web.listen();
console.log("Isolated browser test server ready");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await web.close();
    api.server.closeAllConnections();
    await api.close();
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    process.exit(0);
  });
