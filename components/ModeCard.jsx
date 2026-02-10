"use client";

export default function ModeCard({ mode, setMode }) {
  return (
    <div className="thc-panel mb-6">
      <h3 className="text-xl font-semibold text-glow mb-3">Mode</h3>

      <div className="flex gap-4">
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2 rounded-lg border 
          ${mode === "manual" 
            ? "border-thcMagenta text-thcMagenta" 
            : "border-white/20 text-white/60"}`}
        >
          Manual Mode
        </button>

        <button
          onClick={() => setMode("live")}
          className={`flex-1 py-2 rounded-lg border 
          ${mode === "live" 
            ? "border-thcMagenta text-thcMagenta" 
            : "border-white/20 text-white/60"}`}
        >
          Live Mode
        </button>
      </div>
    </div>
  );
}
