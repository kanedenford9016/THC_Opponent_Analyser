"use client";

import { useState } from "react";

/* --- Helpers (aligned with analyze page) --- */

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

function clampPercent(v) {
  if (typeof v !== "number" || isNaN(v)) return null;
  return Math.max(0, Math.min(100, v));
}

/**
 * Smooth colour fade using HSL.
 *
 * Threat: 0% = green -> 50% = yellow -> 100% = red  (hue 120 -> 0)
 * Win:    0% = red   -> 50% = yellow -> 100% = green (hue 0 -> 120)
 */
function getMeterColor(pct, type) {
  if (pct == null) return "hsl(0, 0%, 50%)"; // fallback grey

  let hue;
  if (type === "threat") {
    hue = 120 - pct * 1.2; // 0 => 120 (green), 100 => 0 (red)
  } else {
    hue = pct * 1.2; // 0 => 0 (red), 100 => 120 (green)
  }
  return `hsl(${hue}, 90%, 55%)`;
}

function Meter({ label, value, type, locked, hasIntel }) {
  const pct = clampPercent(value);

  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
        <span>{label}</span>
        {!locked && hasIntel && pct !== null && (
          <span className="text-zinc-100 font-semibold">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden relative">
        {!locked && hasIntel && pct !== null && (
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: getMeterColor(pct, type),
            }}
          />
        )}
      </div>
    </div>
  );
}

function normalizeText(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join("\n");
  if (typeof value === "string") return value;
  return String(value);
}

function makePreview(text, maxChars = 80) {
  if (!text) return "";
  const first = text.split(/\r?\n/)[0].split(".")[0] || text;
  let out = first.trim();
  if (out.length > maxChars) {
    out = out.slice(0, maxChars - 3).trim() + "...";
  }
  return out;
}

function Section({ title, fullText, previewText, locked, hasIntel }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1">
        {title}
      </div>

      {!hasIntel && (
        <div className="text-[11px] text-zinc-500">
          No intel yet. Run Analyze All to generate data.
        </div>
      )}

      {hasIntel && locked && previewText && (
        <div className="text-xs text-zinc-100 leading-snug">
          {previewText}
        </div>
      )}

      {hasIntel && locked && !previewText && (
        <div className="text-[11px] text-zinc-500">
          Unlock to view {title.toLowerCase()} for this target.
        </div>
      )}

      {hasIntel && !locked && fullText && (
        <div className="text-xs text-zinc-100 whitespace-pre-line leading-snug">
          {fullText}
        </div>
      )}

      {hasIntel && !locked && !fullText && (
        <div className="text-[11px] text-zinc-500">No data.</div>
      )}
    </div>
  );
}

/* --- Card component --- */

export default function OpponentCard({
  data,
  isUnlocked = false,
  isStaff = false,
  onUnlock = null,      // should return a Promise, truthy=success
  creditsRemaining = null,
  onRemove = null,      // optional callback to parent
}) {
  const result = data?.result || {};
  const hasIntel = result && Object.keys(result).length > 0;

  const threat = getThreatFromResult(data);
  const winChance = getWinChanceFromResult(data);

  const archetype =
    result.archetype ||
    result.style ||
    result.phenotype ||
    result.archetypeLabel ||
    "Unknown";

  const strengthsFull = hasIntel
    ? normalizeText(
        result.strengths ||
          result.strengthsText ||
          result.strengths_summary
      )
    : "";

  const weaknessesFull = hasIntel
    ? normalizeText(
        result.weaknesses ||
          result.weaknessesText ||
          result.weaknesses_summary
      )
    : "";

  const strategyFull = hasIntel
    ? normalizeText(result.strategy || result.strategyText || result.plan)
    : "";

  const strengthsPreview = hasIntel ? makePreview(strengthsFull) : "";
  const weaknessesPreview = hasIntel ? makePreview(weaknessesFull) : "";

  const name = data?.name || "Unknown target";
  const id = data?.id ? String(data.id) : null;

  // Local unlock + hidden state
  const [locallyUnlocked, setLocallyUnlocked] = useState(isUnlocked);
  const [unlocking, setUnlocking] = useState(false);
  const [hidden, setHidden] = useState(false);

  const unlocked = isStaff || locallyUnlocked || isUnlocked;
  const canShowUnlockButton = !unlocked && !isStaff && !!onUnlock;

  const handleUnlockClick = async () => {
    if (!onUnlock || unlocking) return;
    setUnlocking(true);
    try {
      const res = await onUnlock();
      if (res !== false) {
        setLocallyUnlocked(true);
      }
    } catch (e) {
      console.error("Unlock error in OpponentCard:", e);
    } finally {
      setUnlocking(false);
    }
  };

  const handleRemoveClick = () => {
    // Visually hide this card immediately
    setHidden(true);
    // Notify parent if provided
    if (onRemove) {
      onRemove(id);
    }
  };

  // If removed, don’t render anything
  if (hidden) {
    return null;
  }

  return (
    <div className="relative h-full bg-black/70 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
      {/* Corner cross */}
      <button
        type="button"
        onClick={handleRemoveClick}
        className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-lg leading-none shadow-md"
        aria-label="Remove opponent"
      >
        ✕
      </button>

      {/* Header – name + ID */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--thc-magenta)]">
            {name}
          </div>
          {id && (
            <div className="text-[11px] text-zinc-500">ID: {id}</div>
          )}
        </div>
      </div>

      {/* Threat / Win bars */}
      <div className="mt-1 space-y-1">
        <Meter
          label="Threat"
          value={threat}
          type="threat"
          locked={!unlocked}
          hasIntel={hasIntel}
        />
        <Meter
          label="Win chance"
          value={winChance}
          type="win"
          locked={!unlocked}
          hasIntel={hasIntel}
        />
      </div>

      {/* Archetype */}
      <div className="mt-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-400">
          Archetype
        </div>
        <div className="text-sm text-zinc-100">{archetype}</div>
      </div>

      {/* Sections */}
      <div className="mt-2 space-y-2">
        <Section
          title="Strengths"
          fullText={strengthsFull}
          previewText={strengthsPreview}
          locked={!unlocked}
          hasIntel={hasIntel}
        />
        <Section
          title="Weaknesses"
          fullText={weaknessesFull}
          previewText={weaknessesPreview}
          locked={!unlocked}
          hasIntel={hasIntel}
        />
        <Section
          title="Strategy"
          fullText={strategyFull}
          previewText={null}
          locked={!unlocked}
          hasIntel={hasIntel}
        />
      </div>

      {/* Bottom / unlock status */}
      {!unlocked && !isStaff && (
        <div className="mt-3 pt-3 border-t border-zinc-800 text-center">
          {canShowUnlockButton ? (
            <>
              <button
                type="button"
                onClick={handleUnlockClick}
                disabled={unlocking}
                className="inline-flex items-center justify-center rounded-md border border-[var(--thc-magenta)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--thc-magenta)] hover:text-black disabled:opacity-60 transition-colors"
              >
                {unlocking
                  ? "Unlocking..."
                  : "Unlock advanced intel (1 credit)"}
              </button>
              {typeof creditsRemaining === "number" && (
                <div className="mt-1 text-[11px] text-zinc-400">
                  Credits remaining: {creditsRemaining}
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-zinc-500">
              {typeof creditsRemaining === "number" &&
              creditsRemaining <= 0
                ? "No credits available. Contact admin to top up."
                : hasIntel
                ? "Run Analyze All and ensure you have credits to unlock full intel."
                : "Run Analyze All to generate intel, then unlock full details with credits."}
            </p>
          )}
        </div>
      )}

      {unlocked && !isStaff && (
        <div className="mt-3 text-[11px] text-emerald-400">
          Advanced intel unlocked for this target.
        </div>
      )}

      {isStaff && (
        <div className="mt-3 text-[11px] text-emerald-400">
          Staff view: full intel unlocked.
        </div>
      )}
    </div>
  );
}
