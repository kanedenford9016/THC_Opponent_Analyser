// src/lib/parseOpponentIds.ts
export type ParseIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; reason: string; invalidTokens: string[] };

export function parseOpponentIds(raw: string): ParseIdsResult {
  const input = (raw ?? "").trim();
  if (!input) {
    return { ok: false, reason: "No IDs provided.", invalidTokens: [] };
  }

  // Split on commas / whitespace / semicolons / pipes
  const tokens = input
    .replace(/\r/g, "\n")
    .split(/[\s,;|]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  if (!tokens.length) return { ok: false, reason: "No IDs provided.", invalidTokens: [] };

  const invalid: string[] = [];
  const ids: string[] = [];

  for (const t of tokens) {
    if (!/^\d+$/.test(t)) {
      invalid.push(t);
      continue;
    }
    // Keep as string (safe for long ids)
    ids.push(t);
  }

  if (invalid.length) {
    return {
      ok: false,
      reason: "Some entries are not pure numbers.",
      invalidTokens: invalid.slice(0, 10),
    };
  }

  // De-dup
  const uniq = Array.from(new Set(ids));

  // Optional: sanity checks to catch wrong-id-type pastes (Discord snowflakes etc.)
  const looksLikeDiscord = uniq.some((x) => x.length >= 15);
  if (looksLikeDiscord) {
    return {
      ok: false,
      reason:
        "Those look like Discord IDs (very long). I need Opponent IDs (numeric IDs from the game/site), e.g. 1234567.",
      invalidTokens: uniq.filter((x) => x.length >= 15),
    };
  }

  // Optional: cap quantity to protect your API rate/worker time
  if (uniq.length > 50) {
    return { ok: false, reason: "Too many IDs. Max 50 per job.", invalidTokens: [] };
  }

  return { ok: true, ids: uniq };
}