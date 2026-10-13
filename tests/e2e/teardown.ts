import { Pool } from "../../apps/server/src/db/pool";
// Windows terminates child processes without delivering SIGTERM, so clean up
// the exact schema owned by this Playwright run from its parent process too.
export default async function cleanup() {
  const schema = process.env.E2E_SCHEMA,
    url = process.env.TEST_DATABASE_URL;
  if (!schema || !/^e2e_[a-f0-9]{32}$/.test(schema) || !url)
    throw Error("Invalid browser test cleanup configuration");
  if (url === process.env.DATABASE_URL)
    throw Error("Refusing cleanup in the application database");
  const admin = new Pool({ connectionString: url });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await admin.end();
  }
}
