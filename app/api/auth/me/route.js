// app/api/auth/me/route.js
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();

    if (!user) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
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
  } catch (err) {
    console.error("GET /api/auth/me error:", err);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    );
  }
}
