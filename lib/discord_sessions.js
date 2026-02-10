import { sql } from "./db";

const TABLE_SQL = sql`
  CREATE TABLE IF NOT EXISTS discord_sessions (
    user_id TEXT PRIMARY KEY,
    api_key TEXT NOT NULL,
    key_type TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

async function ensureTable() {
  await TABLE_SQL;
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
  await ensureTable();
  const rows = await sql`
    SELECT api_key, key_type, expires_at
    FROM discord_sessions
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) return null;

  const row = rows[0];
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
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
