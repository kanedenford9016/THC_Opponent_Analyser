import { getApiKey } from "./session";

const BASE = "https://api.torn.com";

/* ---------------------------------------------------------
   FETCH PERSONALSTATS (direct Torn API call allowed)
--------------------------------------------------------- */
export async function fetchPersonalStats(id) {
  const key = getApiKey();
  if (!key) throw new Error("Missing API key");

  const url =
    id === "self"
      ? `${BASE}/user/?selections=personalstats&key=${key}`
      : `${BASE}/user/${id}?selections=personalstats&key=${key}`;

  const res = await fetch(url);
  const json = await res.json();

  if (json.error) throw new Error(json.error.error);

  return json.personalstats;
}

/* ---------------------------------------------------------
   FETCH PLAYER NAME (direct basic)
--------------------------------------------------------- */
export async function fetchPlayerName(id) {
  const key = getApiKey();
  if (!key) throw new Error("Missing API key");

  const url = `${BASE}/user/${id}?selections=basic&key=${key}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.error) throw new Error(json.error.error);

  return json.name || `User ${id}`;
}

/* ---------------------------------------------------------
   FIXED: FACTION MEMBERS (goes through backend route ONLY)
   → avoids CORS
   → avoids HTML <DOCTYPE> errors
--------------------------------------------------------- */
export async function fetchFactionMembers(factionId) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing API key");

  // MUST use backend route (Torn blocks browser calls)
  const res = await fetch(
    `/api/torn/faction?factionId=${factionId}&apiKey=${apiKey}`
  );

  const json = await res.json();

  if (json.error) throw new Error(json.error);

  if (!json.members) throw new Error("Faction has no members");

  return Object.entries(json.members).map(([id, m]) => ({
    id,
    name: m.name,
    level: m.level
  }));
}
