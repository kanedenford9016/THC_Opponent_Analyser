// lib/auth.js
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { findUserById } from "./db";

export const AUTH_COOKIE_NAME = "auth";

const SECRET = process.env.AUTH_SECRET || "super_secret_dev_key_change_me";
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ---------------- CREATE JWT TOKEN ----------------
export function createAuthToken(user) {
  if (!user || !user.id) throw new Error("Invalid user for token");

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    SECRET,
    { expiresIn: TOKEN_EXPIRY_SECONDS }
  );
}

// ---------------- VERIFY JWT ----------------
export function verifyAuthToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    console.error("verifyAuthToken error:", err);
    return null;
  }
}

// ---------------- SESSION USER FROM NEON ----------------
export async function getSessionUser() {
  try {
    const token = cookies().get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyAuthToken(token);
    if (!payload?.id) return null;

    const user = await findUserById(payload.id);
    return user || null;
  } catch (err) {
    console.error("getSessionUser error:", err);
    return null;
  }
}

// ---------------- CLEAR COOKIE ----------------
export function clearAuthCookie(res) {
  // `res` must be a NextResponse
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
