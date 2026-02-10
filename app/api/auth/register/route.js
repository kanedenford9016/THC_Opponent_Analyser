import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createUser, findUserByUsername } from "@/lib/db";
import { createAuthToken } from "@/lib/auth";

const isProd = process.env.NODE_ENV === "production";

export async function POST(request) {
  try {
    const body = await request.json();
    let { username, password } = body || {};

    username = (username || "").trim();
    password = password || "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return NextResponse.json(
        { error: "Username already in use." },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // CREATE USER (correct signature)
    const user = await createUser(username, passwordHash);

    // Auto-login if admin/active
    if (user.status === "active") {
      const token = createAuthToken(user);

      const res = NextResponse.json({
        success: true,
        pending: false,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
        },
      });

      res.cookies.set("auth", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return res;
    }

    // If user is pending (non-admin)
    return NextResponse.json({
      success: true,
      pending: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("Register error", err);
    return NextResponse.json(
      { error: "Registration failed." },
      { status: 500 }
    );
  }
}
