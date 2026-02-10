import { NextResponse } from "next/server";

/* ---------------------------------------------------
   SAFE NUMBER
--------------------------------------------------- */
function safeNum(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------
   FEATURE EXTRACTION  (1:1 WITH analyser.py)
--------------------------------------------------- */
function computeFeatures(ps) {
  const aW = safeNum(ps.attackswon);
  const aL = safeNum(ps.attackslost);
  const aD = safeNum(ps.attacksdraw);

  const hits = safeNum(ps.attackhits);
  const miss = safeNum(ps.attackmisses);
  const dmg = safeNum(ps.attackdamage);

  const dW = safeNum(ps.defendswon);
  const dL = safeNum(ps.defendslost);
  const dS = safeNum(ps.defendsstalemated);

  const hosp = safeNum(ps.hospital);
  const mug = safeNum(ps.moneymugged);
  const stealth = safeNum(ps.attacksstealthed);

  const crit = safeNum(ps.attackcriticalhits);
  const ohk = safeNum(ps.onehitkills);

  const totalA = aW + aL + aD;
  const totalD = dW + dL + dS;
  const hitAttempts = hits + miss;

  return {
    totalA,
    totalD,
    hitRate: hitAttempts > 0 ? hits / hitAttempts : 0,
    dmgPerHit: hits > 0 ? dmg / hits : 0,
    defWin: totalD > 0 ? dW / totalD : 0,
    hospPerAtk: totalA > 0 ? hosp / totalA : 0,
    mugPerAtk: totalA > 0 ? mug / totalA : 0,
    stealthRate: totalA > 0 ? stealth / totalA : 0,
    missRate: hitAttempts > 0 ? miss / hitAttempts : 0,
    critRate: hits > 0 ? crit / hits : 0,
    ohkRate: aW > 0 ? ohk / aW : 0,

    volatility: Math.min(
      1,
      (hits > 0 ? ohk / hits : 0) * 0.5 +
        (hits > 0 ? crit / hits : 0) * 0.4 +
        (hitAttempts > 0 ? miss / hitAttempts : 0) * 0.3
    ),
  };
}

/* ---------------------------------------------------
   DISTRIBUTION TABLE  (1:1)
--------------------------------------------------- */
const DIST = {
  hitRate: { mean: 0.511237, std: 0.147376, alpha: 1 },
  dmgPerHit: { mean: 548.217606, std: 529.725014, alpha: 0.85 },
  defWin: { mean: 0.120195, std: 0.137788, alpha: 0.9 },
  hospPerAtk: { mean: 38.479649, std: 272.545811, alpha: 0.35 },
  mugPerAtk: { mean: 73805.15, std: 226289.2, alpha: 0.35 },
  stealthRate: { mean: 0.544715, std: 0.268967, alpha: 1 },
  totalA: { mean: 5221.48, std: 12056.83, alpha: 0.4 },
  volatility: { mean: 0.44128, std: 0.176109, alpha: 1 },
};

/* ---------------------------------------------------
   SQUASH FUNCTION
--------------------------------------------------- */
function squash(value, d) {
  if (!Number.isFinite(value)) return -100;
  const z = (value - d.mean) / (d.std || 1);
  return Math.tanh(z * d.alpha) * 100;
}

/* ---------------------------------------------------
   PHENOTYPES  (1:1)
--------------------------------------------------- */
function computePhenotypes(f) {
  return {
    axes: {
      hitRate: squash(f.hitRate, DIST.hitRate),
      dmgPerHit: squash(f.dmgPerHit, DIST.dmgPerHit),
      defendWin: squash(f.defWin, DIST.defWin),
      hospPerAtk: squash(f.hospPerAtk, DIST.hospPerAtk),
      attackActivity: squash(f.totalA, DIST.totalA),
      stealthRate: squash(f.stealthRate, DIST.stealthRate),
      mugPerAtk: squash(f.mugPerAtk, DIST.mugPerAtk),
      volatility: squash(f.volatility, DIST.volatility),
    },
  };
}

/* ---------------------------------------------------
   CLASSIFY  (1:1)
--------------------------------------------------- */
function archetype(axis, score) {
  if (axis === "hitRate") return "Dex Whore";
  if (axis === "dmgPerHit") return "Str Brick";
  if (axis === "defendWin") return "Tank";
  if (axis === "hospPerAtk") return "Glass Cannon";
  if (axis === "attackActivity") return "Speed Rat";
  if (axis === "mugPerAtk" || axis === "stealthRate") return "Opportunist";
  if (axis === "volatility") return score >= 0 ? "Glass Cannon" : "Balanced";
  return "Balanced";
}

function classify(p) {
  const ax = p.axes;

  const sorted = Object.entries(ax)
    .map(([k, v]) => [k, v, Math.abs(v)])
    .sort((a, b) => b[2] - a[2]);

  const primary = sorted[0];
  const secondary = sorted[1][2] >= 40 ? sorted[1] : null;

  return {
    primary: {
      axis: primary[0],
      score: primary[1],
      name: archetype(primary[0], primary[1]),
    },
    secondary: secondary
      ? {
          axis: secondary[0],
          score: secondary[1],
          name: archetype(secondary[0], secondary[1]),
        }
      : null,
  };
}

/* ---------------------------------------------------
   THREAT MODEL (target-centric, 1:1)
--------------------------------------------------- */
function computeThreat(p) {
  const A = p.axes;

  const safe = (v) => (Number.isFinite(v) ? v : -100);
  const n = (x) => Math.max(0, Math.min(1, (x + 100) / 200));

  const hr = n(safe(A.hitRate));
  const dmg = n(safe(A.dmgPerHit));
  const defw = n(safe(A.defendWin));
  const hosp = n(safe(A.hospPerAtk));
  const act = n(safe(A.attackActivity));
  const ste = n(safe(A.stealthRate));
  const vol = n(safe(A.volatility));

  const effDPS = hr * dmg;

  const off =
    dmg * 0.35 + hr * 0.15 + hosp * 0.35 + effDPS * 0.1 + vol * 0.05;
  const defv = defw * 0.15 + (1 - hosp) * 0.1 + hr * 0.05;
  const exp = act * 0.07 + ste * 0.03;

  const raw = Math.max(0, Math.min(1, off + defv + exp));

  return 0.1 + raw * 0.9;
}

/* ---------------------------------------------------
   CONFIDENCE (hybrid logistic, 1:1)
--------------------------------------------------- */
function computeConfidence(playerThreat, oppThreat) {
  const diff = playerThreat - oppThreat;
  const logistic = 100 / (1 + Math.exp(-0.08 * diff));
  const scaled = logistic * 0.85 + (50 + diff * 0.5) * 0.15;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

/* ---------------------------------------------------
   DESCRIPTIONS  (1:1)
--------------------------------------------------- */
function describeStrengths(c) {
  const key = c.primary.name;
  const out = [];

  if (key === "Dex Whore")
    out.push("Extreme evasiveness / hit-rate dominance.");
  else if (key === "Str Brick")
    out.push("High damage per hit, punishes openings.");
  else if (key === "Glass Cannon")
    out.push("Very high offensive burst and volatility.");
  else if (key === "Speed Rat")
    out.push("High activity and multi-hit pressure.");
  else if (key === "Tank")
    out.push("High defend win-rate and resilience.");
  else if (key === "Opportunist")
    out.push("Stealth / mugging selective aggression.");
  else out.push("Stable behaviour across all axes.");

  return out;
}

function describeWeaknesses(c) {
  const key = c.primary.name;
  const out = [];

  if (key === "Dex Whore") out.push("Low damage potential.");
  else if (key === "Str Brick") out.push("Vulnerable to high evasion.");
  else if (key === "Glass Cannon") out.push("Fragile and punishable.");
  else if (key === "Speed Rat") out.push("Low per-hit damage.");
  else if (key === "Tank") out.push("Struggles to finish targets quickly.");
  else if (key === "Opportunist")
    out.push("Often weaker in direct fights.");
  else out.push("General vulnerability.");

  return out;
}

// Threat level line removed; Dex Whore text changed to pepper spray / tear gas
function describeStrategy(c, threatScore) {
  const lines = [];

  const key = c.primary.name;
  if (key === "Dex Whore") {
    lines.push(
      "Open with pepper spray / tear gas to debuff, then swap to your main damage weapons."
    );
  } else if (key === "Str Brick") {
    lines.push("Avoid trading unless durable.");
  } else if (key === "Glass Cannon") {
    lines.push("Deny burst; take longer exchanges.");
  } else if (key === "Speed Rat") {
    lines.push("Don't get chipped.");
  } else if (key === "Tank") {
    lines.push("Break their sustain or overwhelm.");
  } else if (key === "Opportunist") {
    lines.push("Avoid showing windows of vulnerability.");
  } else {
    lines.push("Tactical play determines outcome.");
  }

  if (c.secondary) {
    lines.push("");
    lines.push(`Secondary influence: ${c.secondary.name}`);
  }

  return lines;
}

/* ---------------------------------------------------
   MAIN HANDLER — return UI-format output
--------------------------------------------------- */
export async function POST(request) {
  try {
    const { player, opponent } = await request.json();

    const pF = computeFeatures(player);
    const oF = computeFeatures(opponent);

    const pP = computePhenotypes(pF);
    const oP = computePhenotypes(oF);

    const pC = classify(pP);
    const oC = classify(oP);

    const pT = computeThreat(pP) * 100;
    const oT = computeThreat(oP) * 100;

    const confidence = computeConfidence(pT, oT);

    return NextResponse.json({
      style: oC.primary.name,
      secondary: oC.secondary ? oC.secondary.name : null,
      threat: Math.round(oT),
      confidence,
      strengths: describeStrengths(oC),
      weaknesses: describeWeaknesses(oC),
      strategy: describeStrategy(oC, oT),
      features: oF,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
