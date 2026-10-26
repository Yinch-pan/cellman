import pg from "pg";
import { readFile } from "node:fs/promises";
export const { Pool } = pg;
export type Database = pg.Pool;
export async function migrate(db: Database) {
  // Each migration is idempotent; preserve existing live game snapshots.
  await db.query(
    await readFile(
      new URL("../../migrations/001-initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/002-replay.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/003-undo.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/004-room-settings.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/005-email.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/006-mail-waits.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL(
        "../../migrations/007-registration-verification.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/008-all-games-count.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/009-snake-async-rooms.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/010-game-lifecycle.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL("../../migrations/011-incremental-time.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    await readFile(
      new URL(
        "../../migrations/012-room-participation-limit.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}
export async function transaction<T>(
  db: Database,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await run(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
