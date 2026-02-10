"use client";

// ------ COLOR SCALE HELPERS ------
// Red → Yellow → Green
function threatColor(value) {
  if (value < 30) return "#2ecc71";     // green (low threat)
  if (value < 60) return "#f1c40f";     // yellow
  if (value < 90) return "#e67e22";     // orange
  return "#e74c3c";                     // red (high threat)
}

// Green → Yellow → Red (REVERSED)
function winColor(value) {
  if (value > 70) return "#2ecc71";     // green (high win chance)
  if (value > 40) return "#f1c40f";     // yellow
  return "#e74c3c";                     // red (low win chance)
}

export default function ResultPanel({ data }) {
  if (!data) return null;

  const threat = Math.round(data.threat || 0);
  const win = Math.round(data.confidence || 0);

  return (
    <div className="text-white space-y-4">

      {/* THREAT */}
      <div>
        <div className="text-sm mb-1">
          Threat: {threat}%
        </div>

        <div className="w-full h-2 bg-white/10 rounded">
          <div
            className="h-2 rounded"
            style={{
              width: `${threat}%`,
              backgroundColor: threatColor(threat)
            }}
          ></div>
        </div>
      </div>

      {/* WIN CHANCE */}
      <div>
        <div className="text-sm mb-1">
          Win Chance: {win}%
        </div>

        <div className="w-full h-2 bg-white/10 rounded">
          <div
            className="h-2 rounded"
            style={{
              width: `${win}%`,
              backgroundColor: winColor(win)
            }}
          ></div>
        </div>
      </div>

      {/* TYPE */}
      <div>
        <div className="font-semibold text-pink-400 text-sm">
          Classification
        </div>
        <div className="text-white/80 text-sm">
          Primary: {data.style}
        </div>
        {data.secondary && (
          <div className="text-white/60 text-sm">
            Secondary: {data.secondary}
          </div>
        )}
      </div>

      {/* STRENGTHS */}
      {data.strengths?.length > 0 && (
        <div>
          <div className="font-semibold text-green-400 text-sm mb-1">
            Strengths
          </div>
          <ul className="list-disc ml-5 text-white/70 text-sm space-y-1">
            {data.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* WEAKNESSES */}
      {data.weaknesses?.length > 0 && (
        <div>
          <div className="font-semibold text-red-400 text-sm mb-1">
            Weaknesses
          </div>
          <ul className="list-disc ml-5 text-white/70 text-sm space-y-1">
            {data.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* STRATEGY */}
      {data.strategy?.length > 0 && (
        <div>
          <div className="font-semibold text-yellow-400 text-sm mb-1">
            Strategy
          </div>
          <ul className="list-disc ml-5 text-white/70 text-sm space-y-1">
            {data.strategy.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
