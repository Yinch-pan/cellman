// Playwright-only server. There are no test fixture routes in the real API.
import { createServer } from "vite";
import { Pool, migrate } from "../../apps/server/src/db/pool";
import { createApp } from "../../apps/server/src/app";
import { encryptedMailer } from "../../apps/server/src/mail/transport";
import { startMailWorker } from "../../apps/server/src/mail/worker";
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
// This sink exists only inside the isolated E2E database. No SMTP or test API route.
await db.query(
  "CREATE TABLE test_mail_deliveries(id text PRIMARY KEY,message jsonb NOT NULL,created_at timestamptz DEFAULT now())",
);
const mailer = encryptedMailer(
  Buffer.from(process.env.E2E_MAIL_KEY!, "base64"),
  async (message, id) => {
    await db.query(
      "INSERT INTO test_mail_deliveries(id,message) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, JSON.stringify(message)],
    );
  },
);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5174);
const apiPort = Number(process.env.E2E_API_PORT ?? 3002);
const origin = `http://127.0.0.1:${webPort}`;
const api = createApp(db, origin, false, [], [], mailer);
const stopMail = startMailWorker(db, mailer, origin);
await api.listen({ port: apiPort, host: "127.0.0.1" });
const web = await createServer({
  configFile: "apps/web/vite.config.ts",
  server: {
    host: "127.0.0.1",
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
await web.listen();
console.log("Isolated browser test server ready");
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await stopMail();
    await web.close();
    api.server.closeAllConnections();
    await api.close();
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    process.exit(0);
  });
