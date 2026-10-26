import { Pool } from "pg";
import { register } from "../../apps/server/src/auth/sessions";

// Game tests use existing active accounts; signup is covered by registration.spec.ts.
// This helper is test-process-only and cannot target the live database.
export async function seedAccount(input: {
  username: string;
  password: string;
}) {
  if (
    !process.env.TEST_DATABASE_URL ||
    process.env.TEST_DATABASE_URL === process.env.DATABASE_URL ||
    !/^e2e_[a-f0-9]{32}$/.test(process.env.E2E_SCHEMA ?? "")
  ) {
    throw Error("Account fixtures require the isolated E2E database");
  }
  const db = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${process.env.E2E_SCHEMA}`,
  });
  try {
    return await register(db, input);
  } finally {
    await db.end();
  }
}
