import { sql } from "./db";
import { randomUUID } from "crypto";

function buildTableSql() {
  return sql`
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
}

async function ensureTable() {
  await executeWithRetry(() => buildTableSql(), "ensureTable");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableNeonError(error) {
  const message = String(error?.message ?? error);
  const code = String(error?.code ?? "");
  return (
    message.includes("fetch failed") ||
    message.includes("UND_ERR_SOCKET") ||
    message.includes("other side closed") ||
    code.includes("UND_")
  );
}

async function executeWithRetry(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= 3 || !isRetryableNeonError(error)) {
        throw error;
      }
      console.log(`[NEON_RETRY] ${label} attempt ${attempt} failed, retrying`);
      await sleep(200 * attempt);
    }
  }
  throw lastError;
}

export async function createJob({ userId, apiKey, targetType, memberIds }) {
  await ensureTable();
  const id = randomUUID();
  await executeWithRetry(
    () => sql`
      INSERT INTO discord_jobs (id, user_id, status, target_type, api_key, raw_ids, member_ids, next_index)
      VALUES (${id}, ${userId}, 'queued', ${targetType}, ${apiKey}, '', ${JSON.stringify(memberIds)}, ${0})
    `,
    "createJob"
  );
  return id;
}

export async function getJob(jobId) {
  await ensureTable();
  const rows = await executeWithRetry(
    () => sql`
      SELECT id, user_id, status, target_type, api_key, raw_ids, member_ids, results, next_index, error
      FROM discord_jobs
      WHERE id = ${jobId}
      LIMIT 1
    `,
    "getJob"
  );
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

  const memberIdsValue =
    member_ids === undefined || member_ids === null
      ? undefined
      : typeof member_ids === "string"
        ? member_ids
        : JSON.stringify(member_ids);

  const resultsValue =
    results === undefined || results === null
      ? undefined
      : typeof results === "string"
        ? results
        : JSON.stringify(results);

  await executeWithRetry(
    () => sql`
      UPDATE discord_jobs
      SET status = COALESCE(${status}, status),
          member_ids = COALESCE(${memberIdsValue}, member_ids),
          results = COALESCE(${resultsValue}, results),
          next_index = COALESCE(${next_index}, next_index),
          error = COALESCE(${error}, error),
          updated_at = NOW()
      WHERE id = ${jobId}
    `,
    "updateJob"
  );
}

export async function deleteJob(jobId) {
  await ensureTable();
  await executeWithRetry(
    () => sql`
      DELETE FROM discord_jobs
      WHERE id = ${jobId}
    `,
    "deleteJob"
  );
}
