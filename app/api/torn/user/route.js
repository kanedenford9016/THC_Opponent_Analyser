// /app/api/torn/user/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get("apiKey");

    if (!apiKey)
      return NextResponse.json({ error: "Missing API key" }, { status: 400 });

    const url = `https://api.torn.com/user/?selections=personalstats&key=${apiKey}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.error)
      return NextResponse.json({ error: json.error.error }, { status: 400 });

    return NextResponse.json({ personalstats: json.personalstats || {} });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
