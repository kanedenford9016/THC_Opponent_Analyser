"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import InputPanel from "../../components/InputPanel";
import OpponentCard from "../../components/OpponentCard";
import Loader from "../../components/Loader";
import PDFAllOpponents from "../../components/PDFAllOpponents";
import { getApiKey, saveApiKey, clearApiKey } from "../../utils/session";

/* ---------- HELPERS FOR THREAT / WIN-CHANCE ---------- */

function getThreatFromResult(opp) {
  const r = opp?.result || opp;
  if (!r) return null;

  if (typeof r.threat === "number") return r.threat;
  if (typeof r.threatScore === "number") return r.threatScore;
  if (typeof r.threat_percent === "number") return r.threat_percent;
  return null;
}

function getWinChanceFromResult(opp) {
  const r = opp?.result || opp;
  if (!r) return null;

  if (typeof r.confidence === "number") return r.confidence;
  if (typeof r.winChance === "number") return r.winChance;
  if (typeof r.win_chance === "number") return r.win_chance;
  return null;
}

/* ---------- API KEY DIALOG ---------- */

function ApiKeyDialog({ open, apiKey, onSave, onCancel }) {
  const [value, setValue] = useState(apiKey || "");

  useEffect(() => {
    setValue(apiKey || "");
  }, [apiKey]);

  if (!open) return null;

  const trimmed = value.trim();
  const isValid = /^[A-Za-z0-9]{16}$/.test(trimmed); // Torn keys are 16 chars

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) {
      alert("That doesn't look like a valid Torn API key (16 characters).");
      return;
    }
    onSave(trimmed);
  };

  const saveBase =
    "flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition";
  const saveEnabledExtra = " bg-zinc-800 text-zinc-100 hover:bg-zinc-700";
  const saveDisabledExtra =
    " bg-zinc-800 text-zinc-500 opacity-60 cursor-not-allowed";
  const saveClassName = isValid
    ? saveBase + saveEnabledExtra
    : saveBase + saveDisabledExtra;

  const cancelClassName =
    "flex-1 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-xl shadow-[0_0_40px_rgba(255,0,118,0.6)]">
        <h2 className="text-2xl font-semibold text-[var(--thc-magenta)] mb-2 text-center">
          Enter Torn API Key
        </h2>
        <p className="text-sm text-zinc-300 mb-4 text-center">
          Your key is stored only for this browser session and used to talk to
          Torn&apos;s API.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
              Torn API key
            </label>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--thc-magenta)]"
              placeholder="Paste your 16-character Torn API key here"
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={!isValid} className={saveClassName}>
              Save Key
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={cancelClassName}
            >
              Cancel
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            Tip: generate a dedicated key just for THC Edge with minimal scopes.
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---------- MAIN ANALYZE PAGE ---------- */
export const dynamic = "force-dynamic";

export default function AnalyzePage() {
  const router = useRouter();

  /* ---------- AUTH STATE (USER + CREDITS) ---------- */

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadMe = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!data.user || cancelled) return;

        const u = data.user;
        setCurrentUser({
          ...u,
          credits:
            typeof u.credits === "number" && Number.isFinite(u.credits)
              ? u.credits
              : 0,
          unlockedOpponents: Array.isArray(u.unlockedOpponents)
            ? u.unlockedOpponents.map(String)
            : [],
        });
      } catch (err) {
        console.error("Failed to load /api/auth/me", err);
      }
    };

    loadMe();

    return () => {
      cancelled = true;
    };
  }, []);

  const isStaff =
    currentUser &&
    (currentUser.role === "admin" || currentUser.role === "moderator");

  /* ---------- API KEY STATE ---------- */

  const [apiKey, setApiKey] = useState("");
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);

  // IMPORTANT: do not read window in state initialiser; do it here
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getApiKey();
    if (stored) {
      setApiKey(stored);
      setShowApiKeyDialog(false);
    } else {
      setShowApiKeyDialog(true);
    }
  }, []);

  const handleSaveApiKey = (key) => {
    saveApiKey(key);
    setApiKey(key);
    setShowApiKeyDialog(false);
  };

  const handleCancelApiKey = () => {
    // If you want to force having a key, you can set this back to true
    setShowApiKeyDialog(false);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      clearApiKey();
      setApiKey("");
      setShowApiKeyDialog(true);
      setCurrentUser(null);
      router.push("/login");
    }
  };

  /* ---------- CORE STATE ---------- */

  const [player, setPlayer] = useState({});
  const [opponents, setOpponents] = useState([]);

  const [loading, setLoading] = useState(false);
  const [singleId, setSingleId] = useState("");
  const [factionId, setFactionId] = useState("");

  // threat_desc | threat_asc | win_desc | win_asc
  const [sortBy, setSortBy] = useState("threat_desc");

  /* ------------- LOAD SINGLE PLAYER ------------- */

  const loadSinglePlayer = async () => {
    const key = apiKey || getApiKey();
    if (!key) {
      setShowApiKeyDialog(true);
      alert("Enter your Torn API key first.");
      return;
    }

    const raw = singleId.trim();
    if (!raw) {
      alert("Enter a player ID.");
      return;
    }

    setLoading(true);
    try {
      const id = raw;
      const res = await fetch(`/api/torn/personalstats?id=${id}&apiKey=${key}`);
      const stats = await res.json();

      if (stats.error) {
        alert("Failed to load that player. Check the ID.");
        return;
      }

      const opp = {
        id,
        name: `Target ${id}`,
        stats,
        result: null,
      };

      setOpponents((prev) => {
        const idx = prev.findIndex((o) => o.id === id);
        if (idx !== -1) {
          const clone = [...prev];
          clone[idx] = { ...clone[idx], ...opp, result: null };
          return clone;
        }
        return [...prev, opp];
      });

      setSingleId("");
    } catch (err) {
      console.error("Error loading single player", err);
      alert("Error loading that player. Try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ------------- FETCH FACTION ------------- */

  const loadFactionMembers = async () => {
    const key = apiKey || getApiKey();
    if (!key) {
      setShowApiKeyDialog(true);
      alert("Enter your Torn API key first.");
      return;
    }
    if (!factionId.trim()) {
      alert("Enter faction ID.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `/api/torn/faction?factionId=${factionId}&apiKey=${key}`
      );
      const json = await res.json();

      if (!json.members) {
        alert("Invalid faction.");
        setLoading(false);
        return;
      }

      const memberList = Object.entries(json.members).map(([id, m]) => ({
        id,
        name: m.name,
      }));

      const newOpps = [];

      for (let i = 0; i < memberList.length; i++) {
        const { id, name } = memberList[i];

        const res2 = await fetch(
          `/api/torn/personalstats?id=${id}&apiKey=${key}`
        );
        const stats = await res2.json();

        const opp = {
          id,
          name,
          stats: stats.error ? {} : stats,
          result: null,
        };

        newOpps.push(opp);
        await new Promise((r) => setTimeout(r, 1000));
      }

      setOpponents(newOpps);
    } catch (err) {
      console.error("Error loading faction members", err);
      alert("Error loading faction members. Try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ------------- ANALYZE ALL ------------- */

  const analyzeAll = async () => {
    if (!player.totalstats) {
      alert("Fetch your stats first.");
      return;
    }

    if (opponents.length === 0) {
      alert("Load at least one player or faction first.");
      return;
    }

    setLoading(true);

    try {
      const updated = [...opponents];

      for (let i = 0; i < updated.length; i++) {
        const opp = updated[i];
        if (!opp.stats || Object.keys(opp.stats).length === 0) continue;

        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player,
            opponent: opp.stats,
          }),
        });

        updated[i].result = await res.json();
      }

      setOpponents(updated);
    } catch (err) {
      console.error("Error analyzing opponents", err);
      alert("Error during analysis. Try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ------------- CLEAR ------------- */

  const clearAll = () => {
    setOpponents([]);
    setSingleId("");
    setFactionId("");
  };

  /* ------------- REMOVE SINGLE OPPONENT ------------- */

  const removeOpponent = (index) => {
    setOpponents((prev) => prev.filter((_, i) => i !== index));
  };

  /* ------------- UNLOCK HANDLER ------------- */

  const handleUnlockOpponent = async (opponentId) => {
    const oppIdStr = String(opponentId || "");
    if (!oppIdStr) return;

    const user = currentUser;
    if (!user) {
      alert("You must be logged in to unlock reports.");
      return;
    }

    const staff =
      user.role === "admin" || user.role === "moderator" ? true : false;

    const currentUnlocked = Array.isArray(user.unlockedOpponents)
      ? user.unlockedOpponents.map(String)
      : [];

    // Already unlocked
    if (currentUnlocked.includes(oppIdStr)) {
      return;
    }

    // Staff: mark as unlocked locally without spending credits
    if (staff) {
      setCurrentUser({
        ...user,
        unlockedOpponents: [...currentUnlocked, oppIdStr],
      });
      return;
    }

    // Members: need credits
    const credits = typeof user.credits === "number" ? user.credits : 0;
    if (credits <= 0) {
      alert("You have no credits left. Contact admin to top up.");
      return;
    }

    try {
      const res = await fetch("/api/reports/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentId: oppIdStr }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to unlock this opponent.");
        return;
      }

      setCurrentUser((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          credits:
            typeof data.credits === "number" && Number.isFinite(data.credits)
              ? data.credits
              : prev.credits,
          unlockedOpponents: Array.isArray(data.unlockedOpponents)
            ? data.unlockedOpponents.map(String)
            : prev.unlockedOpponents,
        };
      });
    } catch (err) {
      console.error("Unlock error", err);
      alert("Error unlocking opponent. Try again.");
    }
  };

  /* ------------- SORTED VIEW ------------- */

  const processedOpponents = useMemo(() => {
    const list = opponents.map((opp, index) => ({ ...opp, _index: index }));
    const dir = sortBy.endsWith("asc") ? 1 : -1;

    list.sort((a, b) => {
      let av;
      let bv;

      if (sortBy.startsWith("win")) {
        av = getWinChanceFromResult(a);
        bv = getWinChanceFromResult(b);
      } else {
        av = getThreatFromResult(a);
        bv = getThreatFromResult(b);
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });

    return list;
  }, [opponents, sortBy]);

  const unlockedIds =
    currentUser && Array.isArray(currentUser.unlockedOpponents)
      ? currentUser.unlockedOpponents.map(String)
      : [];

  const visiblePdfOpponents = isStaff
    ? processedOpponents
    : processedOpponents.filter(
        (opp) => opp.id && unlockedIds.includes(String(opp.id))
      );

  /* ---------- UI ---------- */

  return (
    <main
      className="
        w-full 
        max-w-screen-xl 
        mx-auto 
        px-4 sm:px-6 md:px-10 
        py-6 
        flex flex-col lg:flex-row 
        gap-6 lg:gap-10
      "
    >
      <ApiKeyDialog
        open={showApiKeyDialog}
        apiKey={apiKey}
        onSave={handleSaveApiKey}
        onCancel={handleCancelApiKey}
      />

      {/* LEFT SIDEBAR */}
      <div className="w-full lg:w-72 shrink-0">
        <InputPanel
          player={player}
          setPlayer={setPlayer}
          loading={loading}
          setLoading={setLoading}
        />

        <button
          className="thc-btn w-full mb-3"
          onClick={analyzeAll}
          disabled={loading}
        >
          Analyze All
        </button>

        {/* Single Player Tools */}
        <div className="bg-white/5 p-3 rounded-xl border border-white/10 mb-4">
          <h3 className="text-sm text-white/60 mb-2">Single Player</h3>

          <input
            className="w-full mb-2 p-2 rounded bg-white/10 border border-white/10 text-sm"
            placeholder="Player ID"
            value={singleId}
            onChange={(e) => setSingleId(e.target.value)}
          />

          <button
            className="thc-btn w-full"
            onClick={loadSinglePlayer}
            disabled={loading}
          >
            Load Player
          </button>
        </div>

        {/* Faction Tools */}
        <div className="bg-white/5 p-3 rounded-xl border border-white/10 mb-4">
          <h3 className="text-sm text-white/60 mb-2">Faction Tools</h3>

          <input
            className="w-full mb-2 p-2 rounded bg-white/10 border border-white/10 text-sm"
            placeholder="Faction ID"
            value={factionId}
            onChange={(e) => setFactionId(e.target.value)}
          />

          <button
            className="thc-btn w-full mb-3"
            onClick={loadFactionMembers}
            disabled={loading}
          >
            Load Faction Members
          </button>

          {/* Sorting */}
          <div className="space-y-2 text-xs text-white/80">
            <div>
              <label className="block mb-1 opacity-80">Sort by</label>
              <div className="relative">
                <select
                  className="w-full p-2 pr-8 rounded bg-black/70 text-white border border-white/20 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--thc-magenta)] appearance-none"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="threat_desc">Threat: High → Low</option>
                  <option value="threat_asc">Threat: Low → High</option>
                  <option value="win_desc">Win %: High → Low</option>
                  <option value="win_asc">Win %: Low → High</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/70">
                  ▼
                </span>
              </div>
            </div>

            <button
              className="thc-btn w-full mt-1"
              type="button"
              onClick={clearAll}
              disabled={loading}
            >
              Clear
            </button>
          </div>
        </div>

        {/* User / Credits summary */}
        {currentUser && (
          <div className="bg-white/5 p-3 rounded-xl border border-white/10 mb-3 text-xs text-white/80">
            <div className="flex justify-between">
              <span>User</span>
              <span className="font-semibold">{currentUser.username}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Role</span>
              <span className="font-semibold">{currentUser.role}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span>Credits</span>
              <span className="font-semibold">{currentUser.credits || 0}</span>
            </div>
          </div>
        )}

        <PDFAllOpponents opponents={visiblePdfOpponents} />

        {isStaff && (
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="thc-btn w-full mt-3"
          >
            Admin Panel
          </button>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="thc-btn w-full mt-3"
        >
          Logout
        </button>
      </div>

      {/* OPPONENT GRID */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {processedOpponents.map((opp, i) => {
          const idStr = opp.id ? String(opp.id) : "";
          const isUnlocked =
            isStaff || (idStr && unlockedIds.includes(idStr));
          const hasAnalysis = !!opp.result;

          const creditsRemaining =
            currentUser && typeof currentUser.credits === "number"
              ? currentUser.credits
              : 0;

          const canUnlock =
            !isStaff &&
            currentUser &&
            hasAnalysis &&
            !isUnlocked &&
            creditsRemaining > 0;

          return (
            <OpponentCard
              key={idStr || i}
              data={opp}
              isUnlocked={isUnlocked}
              isStaff={isStaff}
              onUnlock={
                canUnlock ? () => handleUnlockOpponent(opp.id) : null
              }
              creditsRemaining={creditsRemaining}
            />
          );
        })}
      </div>

      {loading && <Loader />}
    </main>
  );
}
