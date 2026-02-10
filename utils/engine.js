export function computeThreat(stats) {
  const { attackhits, attackmisses, attackswon, attackdamage } = stats;

  const hitRate = attackhits + attackmisses > 0 
    ? attackhits / (attackhits + attackmisses)
    : 0;

  const aggression = attackswon;
  const dmg = attackdamage;

  let threat = (
    hitRate * 55 +
    Math.log10(aggression + 1) * 22 +
    Math.log10(dmg + 1) * 23
  );

  if (!isFinite(threat)) threat = 0;
  return Math.min(100, Math.max(0, threat));
}

export function computeConfidence(player, opp) {
  const p = computeThreat(player);
  const o = computeThreat(opp);

  const diff = p - o;
  const raw = 100 / (1 + Math.exp(-0.08 * diff));
  const scaled = (raw * 0.85) + (50 + diff * 0.5) * 0.15;

  return Math.min(100, Math.max(0, scaled.toFixed(1)));
}

export function classifyStyle(stats) {
  const { attackhits, attackmisses } = stats;

  const hitRate = attackhits + attackmisses > 0 
    ? attackhits / (attackhits + attackmisses)
    : 0;

  if (hitRate > 0.75) return "Dex Whore";
  if (hitRate < 0.40) return "Brick";
  return "Balanced";
}

export function analyze(stats, playerStats) {
  return {
    style: classifyStyle(stats),
    threat: computeThreat(stats),
    confidence: computeConfidence(playerStats, stats),
    strengths: ["High stability", "Strong evasiveness"],
    weaknesses: ["Low burst damage", "Struggles vs accuracy"],
    strategy: [
      "Use accuracy weapons first.",
      "Burst the opener.",
      "Punish recovery windows."
    ]
  };
}
