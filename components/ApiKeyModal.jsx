"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen dialog that asks the user for their Torn API key.
 * Used as a "login" for THC Edge.
 */
export default function ApiKeyModal({
  isOpen,
  initialKey = "",
  onSave,
}) {
  const [value, setValue] = useState(initialKey);

  useEffect(() => {
    if (isOpen) {
      setValue(initialKey || "");
    }
  }, [initialKey, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!onSave) return;
    onSave(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-xl">
        <h2 className="text-2xl font-semibold text-thcMagenta mb-2 text-center">
          Login with Torn API key
        </h2>
        <p className="text-sm text-zinc-300 mb-4 text-center">
          Your key never leaves this browser except when talking to Torn. It is stored locally and you
          can revoke it any time from your Torn settings.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
              API key
            </label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-thcMagenta"
              placeholder="Paste your Torn API key here"
            />
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-thcMagenta text-black hover:brightness-110 transition"
          >
            Save &amp; continue
          </button>

          <p className="text-[11px] text-zinc-500 text-center">
            Tip: generate a dedicated key for THC Edge with only the scopes it needs.
          </p>
        </form>
      </div>
    </div>
  );
}
