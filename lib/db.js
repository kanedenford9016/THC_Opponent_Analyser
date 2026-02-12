// lib/db.js
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

// DB connection string
const connectionString =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

const hasConnectionString = Boolean(connectionString);

const isValidConnectionString = (() => {
  if (!connectionString) return false;
  try {
    new URL(connectionString);
    return true;
  } catch {
    return false;
  }
})();

export const sql = isValidConnectionString
  ? neon(connectionString)
  : () => {
      throw new Error("DATABASE_URL or NEON_DATABASE_URL is invalid or not set.");
    };

console.log("[NEON] db url present", hasConnectionString, "valid", isValidConnectionString);

/* ---------------------------------------------------
   USER MAPPER
--------------------------------------------------- */
function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    credits: Number(row.credits ?? 0),
    unlockedOpponents: row.unlocked_opponents || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLogin: row.last_login,
  };
}

/* ---------------------------------------------------
   GET ALL USERS
--------------------------------------------------- */
export async function getAllUsers() {
  const rows = await sql`
    SELECT *
    FROM users
    ORDER BY created_at DESC
  `;
  return rows.map(mapUser);
}

/* ---------------------------------------------------
   FIND BY ID
--------------------------------------------------- */
export async function findUserById(id) {
  const rows = await sql`
    SELECT *
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

/* ---------------------------------------------------
   FIND BY USERNAME
--------------------------------------------------- */
export async function findUserByUsername(username) {
  const rows = await sql`
    SELECT *
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  return rows[0] ? mapUser(rows[0]) : null;
}

/* ---------------------------------------------------
   CREATE USER (Used by /api/auth/register)
--------------------------------------------------- */
export async function createUser(username, passwordHash) {
  // Determine if this is the first user
  const countRows = await sql`SELECT COUNT(*) AS count FROM users`;
  const userCount = Number(countRows[0].count);

  const role = userCount === 0 ? "admin" : "member";
  const status = userCount === 0 ? "active" : "pending";

  const rows = await sql`
    INSERT INTO users
      (username, password_hash, role, status, credits, unlocked_opponents)
    VALUES
      (${username}, ${passwordHash}, ${role}, ${status}, 0, ARRAY[]::text[])
    RETURNING *
  `;

  return mapUser(rows[0]);
}


/* ---------------------------------------------------
   UPDATE USER (Admin panel)
--------------------------------------------------- */
export async function updateUser(id, updates) {
  const credits =
    updates.credits == null || updates.credits === ""
      ? 0
      : Number(updates.credits);

  const existing = await sql`
    SELECT role, status, credits
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!existing.length) return null;

  const cur = existing[0];

  const newRole = updates.role || cur.role;
  const newStatus = updates.status || cur.status;
  const newCredits = !isNaN(credits) ? credits : Number(cur.credits ?? 0);

  const rows = await sql`
    UPDATE users
    SET role = ${newRole},
        status = ${newStatus},
        credits = ${newCredits},
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;

  return rows.length ? mapUser(rows[0]) : null;
}
