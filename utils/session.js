// utils/session.js

const STORAGE_KEY = "thc_edge_api_key";

/**
 * Get the Torn API key from sessionStorage.
 * Falls back to legacy localStorage just in case,
 * but we immediately migrate it to sessionStorage.
 */
export function getApiKey() {
  if (typeof window === "undefined") return "";

  try {
    // Preferred: sessionStorage (per tab session)
    const fromSession = window.sessionStorage.getItem(STORAGE_KEY);
    if (fromSession) return fromSession;

    // Legacy: if we ever stored it in localStorage, migrate once
    const fromLocal = window.localStorage.getItem(STORAGE_KEY);
    if (fromLocal) {
      window.sessionStorage.setItem(STORAGE_KEY, fromLocal);
      window.localStorage.removeItem(STORAGE_KEY);
      return fromLocal;
    }

    return "";
  } catch {
    return "";
  }
}

/**
 * Save the Torn API key for the current browser session only.
 */
export function saveApiKey(key) {
  if (typeof window === "undefined") return;
  const trimmed = (key || "").trim();

  try {
    if (!trimmed) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, trimmed);
    // kill any legacy localStorage copy
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Clear the API key completely (used on logout).
 */
export function clearApiKey() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
