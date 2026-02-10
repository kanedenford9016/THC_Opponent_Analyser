"use client";

export default function OpponentTabs({
  opponents,
  activeTab,
  setActiveTab,
  addOpponent,
  removeOpponent
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto mt-6 mb-4 pb-2">

      {opponents.map((opp, idx) => {
        const name =
          opp.name?.trim() ||
          opp.id?.toString() ||
          `Opponent ${idx + 1}`;

        const active = idx === activeTab;

        return (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            className={`
              px-4 py-2 rounded-lg whitespace-nowrap
              transition-all duration-150
              ${active
                ? "bg-[#ff006e] text-white shadow-lg"
                : "bg-white/10 text-white/70 hover:bg-white/20"}
            `}
          >
            {name}
          </button>
        );
      })}

      {/* ADD NEW OPPONENT TAB */}
      <button
        onClick={addOpponent}
        className="
          px-4 py-2 rounded-lg bg-white/10 
          text-white/70 hover:bg-white/20 whitespace-nowrap
        "
      >
        + Add
      </button>

      {/* REMOVE ACTIVE OPPONENT BUTTON */}
      {opponents.length > 1 && (
        <button
          onClick={removeOpponent}
          className="
            px-4 py-2 rounded-lg bg-red-700/40 
            text-red-200 hover:bg-red-700/60 whitespace-nowrap
          "
        >
          ✕ Remove
        </button>
      )}
    </div>
  );
}
