// /app/api/torn/personalstats/route.js

import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");
    const apiKey = searchParams.get("apiKey");

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "Missing apiKey" }, { status: 400 });

    const url = `https://api.torn.com/user/${id}?selections=personalstats&key=${apiKey}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.error) {
      return NextResponse.json({ error: json.error.error }, { status: 400 });
    }

    return NextResponse.json(json.personalstats || {});

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
