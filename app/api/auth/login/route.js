// app/api/auth/login/route.js
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByUsername } from "@/lib/db";
import { createAuthToken, AUTH_COOKIE_NAME } from "@/lib/auth";

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

    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    // user.passwordHash comes from mapUser(password_hash)
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    if (user.status === "pending") {
      return NextResponse.json(
        { error: "Your account is pending approval." },
        { status: 403 }
      );
    }

    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled." },
        { status: 403 }
      );
    }

    const token = createAuthToken(user);

    const res = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
          credits: user.credits,
        },
      },
      { status: 200 }
    );

    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (err) {
    console.error("Login error", err);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
