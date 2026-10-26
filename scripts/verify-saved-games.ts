// Read-only deployment check; run as the service user with DATABASE_URL set.
import { Pool } from "pg";
import assert from "node:assert/strict";
import { replayRecord } from "../packages/rules/src/replay";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const c = await db.connect();
try {
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const { rows } = await c.query(
    "SELECT id,state,initial_state,revision,rules_version FROM games ORDER BY id",
  );
  const versions: Record<string, number> = {};
  for (const game of rows) {
    const initial = game.initial_state ?? game.state;
    const commands = await c.query(
      "SELECT revision,seat,action FROM game_commands WHERE game_id=$1 AND revision>$2 ORDER BY revision",
      [game.id, initial.revision],
    );
    const result = replayRecord({
      initial,
      commands: commands.rows,
      storage: "postgres-jsonb",
    });
    assert.deepEqual(result.state, game.state, "Saved game replay mismatch");
    assert.equal(result.state.revision, game.revision);
    versions[game.rules_version] = (versions[game.rules_version] ?? 0) + 1;
  }
  await c.query("COMMIT");
  console.log(JSON.stringify({ savedGamesVerified: rows.length, versions }));
} catch (error) {
  await c.query("ROLLBACK");
  throw error;
} finally {
  c.release();
  await db.end();
}
