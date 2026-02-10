import { sql } from "./db";

const TABLE_SQL = sql`
  CREATE TABLE IF NOT EXISTS discord_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    target_type TEXT NOT NULL,
    api_key TEXT NOT NULL,
    raw_ids TEXT NOT NULL,
    member_ids JSONB,
    results JSONB,
    next_index INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

async function ensureTable() {
  await TABLE_SQL;
}

export async function createJob({ userId, apiKey, targetType, memberIds }) {
  await ensureTable();
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO discord_jobs (id, user_id, status, target_type, api_key, raw_ids, member_ids, next_index)
    VALUES (${id}, ${userId}, 'queued', ${targetType}, ${apiKey}, '', ${JSON.stringify(memberIds)}, ${0})
  `;
  return id;
}

export async function getJob(jobId) {
  await ensureTable();
  const rows = await sql`
    SELECT id, user_id, status, target_type, api_key, raw_ids, member_ids, results, next_index, error
    FROM discord_jobs
    WHERE id = ${jobId}
    LIMIT 1
  `;
  return rows.length ? rows[0] : null;
}

export async function updateJob(jobId, updates) {
  await ensureTable();
  const {
    status,
    member_ids,
    results,
    next_index,
    error,
  } = updates;

  await sql`
    UPDATE discord_jobs
    SET status = COALESCE(${status}, status),
        member_ids = COALESCE(${member_ids}, member_ids),
        results = COALESCE(${results}, results),
        next_index = COALESCE(${next_index}, next_index),
        error = COALESCE(${error}, error),
        updated_at = NOW()
    WHERE id = ${jobId}
  `;
}

export async function deleteJob(jobId) {
  await ensureTable();
  await sql`
    DELETE FROM discord_jobs
    WHERE id = ${jobId}
  `;
}
