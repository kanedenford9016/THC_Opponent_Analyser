"use client";

import { getApiKey } from "../utils/session";

export default function InputPanel({
  player,
  setPlayer,
  loading,
  setLoading,
}) {
  const fetchMyStats = async () => {
    const key = getApiKey();
    if (!key) {
      alert("Enter your Torn API key first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/torn/user?apiKey=${key}`);
      const json = await res.json();

      if (!json.personalstats) {
        alert("Invalid API key or no stats returned.");
      } else {
        setPlayer(json.personalstats);
      }
    } catch (err) {
      console.error("Failed to fetch user stats", err);
      alert("Failed to contact Torn API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <button
        className="thc-btn w-full mb-4"
        onClick={fetchMyStats}
        disabled={loading}
      >
        Fetch My Stats
      </button>

      {/* READ-ONLY PLAYER STATS CARD */}
      {player && player.strength && (
        <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/10">
          <h3 className="text-center text-pink-400 font-semibold mb-3">
            Your Stats
          </h3>

          <div className="space-y-2 text-white text-sm">
            <div className="flex justify-between">
              <span>Strength:</span>
              <span>{player.strength.toLocaleString()}</span>
            </div>

            <div className="flex justify-between">
              <span>Defense:</span>
              <span>{player.defense.toLocaleString()}</span>
            </div>

            <div className="flex justify-between">
              <span>Speed:</span>
              <span>{player.speed.toLocaleString()}</span>
            </div>

            <div className="flex justify-between">
              <span>Dexterity:</span>
              <span>{player.dexterity.toLocaleString()}</span>
            </div>

            <div className="flex justify-between pt-2 border-t border-white/10">
              <span>Total Stats:</span>
              <span>{player.totalstats?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
