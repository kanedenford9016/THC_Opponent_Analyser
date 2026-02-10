import { NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

export async function POST() {
  const res = NextResponse.json({ success: true });

  // Match the flags we used in login/register:
  //  - secure only in prod
  //  - sameSite/path identical
  res.cookies.set("auth", "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // delete immediately
  });

  return res;
}
