// /app/api/torn/faction/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const factionId = searchParams.get("factionId");
    const apiKey = searchParams.get("apiKey");

    if (!factionId)
      return NextResponse.json({ error: "Missing factionId" }, { status: 400 });

    if (!apiKey)
      return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });

    const url = `https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.error)
      return NextResponse.json({ error: json.error.error }, { status: 400 });

    return NextResponse.json(json);

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
