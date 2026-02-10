// app/api/admin/users/route.js
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAllUsers, updateUser } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/users  -> list users
export async function GET() {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser || sessionUser.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized: admin access only" },
        { status: 401 }
      );
    }

    const users = await getAllUsers();
    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json(
      { error: "Failed to load users" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users  -> update a user
export async function PATCH(req) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser || sessionUser.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized: admin access only" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { id, updates } = body || {};

    if (!id || !updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid id/updates" },
        { status: 400 }
      );
    }

    const cleanUpdates = {};

    if ("role" in updates && updates.role) {
      cleanUpdates.role = String(updates.role);
    }

    if ("status" in updates && updates.status) {
      cleanUpdates.status = String(updates.status);
    }

    if ("credits" in updates) {
      const c =
        updates.credits === "" || updates.credits == null
          ? 0
          : Number(updates.credits);
      cleanUpdates.credits = Number.isNaN(c) ? 0 : c;
    }

    if ("unlockedOpponents" in updates) {
      cleanUpdates.unlockedOpponents = Array.isArray(updates.unlockedOpponents)
        ? updates.unlockedOpponents
        : [];
    }

    if (Object.keys(cleanUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await updateUser(id, cleanUpdates);

    if (!updated) {
      return NextResponse.json(
        { error: "User not found or not updated" },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/admin/users error:", err);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
