// app/api/reports/unlock/route.js
import { NextResponse } from "next/server";
import { getSessionUser } from "../../../../lib/auth";
import { updateUser, findUserById } from "@/lib/db";


function isStaff(user) {
  if (!user) return false;
  const role = user.role || "member";
  return role === "admin" || role === "moderator";
}

export async function POST(req) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    // Always reload fresh user from users.json
    const user = await findUserById(sessionUser.id);
    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        { error: "Account is not active." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let ids = [];

    if (Array.isArray(body.opponentIds)) {
      ids = body.opponentIds.map((x) => String(x));
    }
    if (body.opponentId) {
      ids.push(String(body.opponentId));
    }

    // Dedupe and drop empties
    ids = Array.from(
      new Set(ids.map((x) => x.trim()).filter(Boolean))
    );

    if (ids.length === 0) {
      return NextResponse.json(
        {
          success: true,
          credits: user.credits || 0,
          unlockedOpponents: user.unlockedOpponents || [],
        },
        { status: 200 }
      );
    }

    const alreadyUnlocked = Array.isArray(user.unlockedOpponents)
      ? user.unlockedOpponents.map(String)
      : [];

    const newToUnlock = ids.filter(
      (id) => !alreadyUnlocked.includes(id)
    );

    // Nothing new to unlock
    if (newToUnlock.length === 0) {
      return NextResponse.json(
        {
          success: true,
          credits: user.credits || 0,
          unlockedOpponents: alreadyUnlocked,
        },
        { status: 200 }
      );
    }

    const staff = isStaff(user);
    const currentCredits =
      typeof user.credits === "number" && Number.isFinite(user.credits)
        ? user.credits
        : 0;

    let remainingCredits = currentCredits;

    if (!staff) {
      if (currentCredits < newToUnlock.length) {
        return NextResponse.json(
          {
            error: `Not enough credits. Need ${newToUnlock.length}, have ${currentCredits}.`,
          },
          { status: 400 }
        );
      }
      remainingCredits = currentCredits - newToUnlock.length;
    }

    const updatedUnlocked = Array.from(
      new Set([...alreadyUnlocked, ...newToUnlock])
    );

    const updated = await updateUser(user.id, {
      credits: remainingCredits,
      unlockedOpponents: updatedUnlocked,
    });

    return NextResponse.json(
      {
        success: true,
        credits:
          typeof updated.credits === "number"
            ? updated.credits
            : remainingCredits,
        unlockedOpponents: updated.unlockedOpponents || updatedUnlocked,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/reports/unlock error:", err);
    return NextResponse.json(
      { error: "Server error unlocking opponents." },
      { status: 500 }
    );
  }
}
