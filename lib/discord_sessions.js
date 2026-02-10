import { sql } from "./db";

async function ensureTable() {
  console.log("ensureTable: start");
  const createTable = sql`
    CREATE TABLE IF NOT EXISTS discord_sessions (
      user_id TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      key_type TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await Promise.race([
    createTable,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("ensureTable timed out after 5000ms")), 5000)
    ),
  ]);
  console.log("ensureTable: done");
}

export async function setDiscordSession(userId, apiKey, keyType, ttlSeconds) {
  await ensureTable();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await sql`
    INSERT INTO discord_sessions (user_id, api_key, key_type, expires_at)
    VALUES (${userId}, ${apiKey}, ${keyType}, ${expiresAt})
    ON CONFLICT (user_id)
    DO UPDATE SET api_key = ${apiKey}, key_type = ${keyType}, expires_at = ${expiresAt}
  `;
}

export async function getDiscordSession(userId) {
  console.log("getDiscordSession: start", userId);
  await ensureTable();
  console.log("getDiscordSession: table ready", userId);
  const rows = await sql`
    SELECT api_key, key_type, expires_at
    FROM discord_sessions
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  console.log("getDiscordSession: query done", userId, rows.length);
  if (!rows.length) return null;

  const row = rows[0];
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    console.log("getDiscordSession: expired", userId);
    await deleteDiscordSession(userId);
    return null;
  }

  return {
    apiKey: row.api_key,
    keyType: row.key_type,
    expiresAt,
  };
}

export async function deleteDiscordSession(userId) {
  await ensureTable();
  await sql`
    DELETE FROM discord_sessions
    WHERE user_id = ${userId}
  `;
}
