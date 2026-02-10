import { jsPDF } from "jspdf";

const DEFAULT_BASE_URL = "https://api.torn.com/v2";
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log("Torn fetch start", label, url);
    const response = await fetch(url, { ...options, signal: controller.signal });
    console.log("Torn fetch done", label, response.status);
    return response;
  } catch (error) {
    console.log("Torn fetch error", label, error instanceof Error ? error.message : error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parseIds(rawIds) {
  const ids = String(rawIds || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!ids.length) {
    throw new Error("No valid IDs provided.");
  }
  for (const id of ids) {
    if (!/^\d+$/.test(id)) {
      throw new Error(`Invalid ID: ${id}`);
    }
  }
  return ids;
}

function formatStatus(statusObj) {
  if (!statusObj) return "N/A";
  if (typeof statusObj === "string") return statusObj;
  if (typeof statusObj === "object") {
    const state = statusObj.state || "N/A";
    const desc = statusObj.description || "";
    return desc ? `${state} - ${desc}` : state;
  }
  return String(statusObj);
}

export function formatPersonalStats(personalstats) {
  const formatted = {};
  const attacking = personalstats?.attacking || {};

  if (attacking && Object.keys(attacking).length) {
    const attacks = attacking.attacks || {};
    const attacksTotal = (attacks.won || 0) + (attacks.lost || 0) + (attacks.stalemate || 0);
    const attackWinrate = attacksTotal > 0 ? (attacks.won || 0) / attacksTotal : 0;

    const defends = attacking.defends || {};
    const defendsTotal = (defends.won || 0) + (defends.lost || 0) + (defends.stalemate || 0);
    const defendWinrate = defendsTotal > 0 ? (defends.won || 0) / defendsTotal : 0;

    const hits = attacking.hits || {};
    const hitsTotal = (hits.success || 0) + (hits.miss || 0);
    const hitAccuracy = hitsTotal > 0 ? (hits.success || 0) / hitsTotal : 0;

    formatted.attacks = {
      total: attacksTotal,
      won: attacks.won || 0,
      lost: attacks.lost || 0,
      stalemate: attacks.stalemate || 0,
      winrate: `${(attackWinrate * 100).toFixed(1)}%`,
    };

    formatted.defends = {
      total: defendsTotal,
      won: defends.won || 0,
      lost: defends.lost || 0,
      stalemate: defends.stalemate || 0,
      winrate: `${(defendWinrate * 100).toFixed(1)}%`,
    };

    formatted.hits = {
      success: hits.success || 0,
      miss: hits.miss || 0,
      accuracy: `${(hitAccuracy * 100).toFixed(1)}%`,
    };

    formatted.damage = {
      total: attacking.damage?.total || 0,
      best: attacking.damage?.best || 0,
    };

    formatted.elo = attacking.elo || 1200;
    formatted.killstreak = attacking.killstreak?.best || 0;
    formatted.one_hit_kills = hits.one_hit_kills || 0;
  }

  const training = personalstats?.training || {};
  if (training && Object.keys(training).length) {
    formatted.training = {
      strength: training.strength || 0,
      defence: training.defence || 0,
      speed: training.speed || 0,
      dexterity: training.dexterity || 0,
    };
  }

  const other = personalstats?.other || {};
  const activityData = other.activity || {};
  const activity30d = personalstats?.activity || {};

  if (activityData || activity30d) {
    formatted.activity = {
      time: activityData.time || 0,
      attacks: activity30d.attacks || 0,
      crimes: activity30d.crimes || 0,
      missions: activity30d.missions || 0,
      forum_posts: activity30d.forum_posts || 0,
      streak: {
        current: activityData.streak?.current || 0,
        best: activityData.streak?.best || 0,
      },
    };
  }

  const drugs = personalstats?.drugs || {};
  if (drugs && Object.keys(drugs).length) {
    formatted.drugs = {
      cannabis: drugs.cannabis || 0,
      ecstasy: drugs.ecstasy || 0,
      ketamine: drugs.ketamine || 0,
      lsd: drugs.lsd || 0,
      opium: drugs.opium || 0,
      pcp: drugs.pcp || 0,
      shrooms: drugs.shrooms || 0,
      speed: drugs.speed || 0,
      vicodin: drugs.vicodin || 0,
      xanax: drugs.xanax || 0,
      total: drugs.total || 0,
      overdoses: drugs.overdoses || 0,
      rehabilitations: {
        amount: drugs.rehabilitations?.amount || 0,
        fees: drugs.rehabilitations?.fees || 0,
      },
    };
  }

  return formatted;
}

export function generateSummary(analysis) {
  if (!analysis) return "No data available for analysis.";

  const ps = analysis.personalstats || {};
  const lines = [];

  lines.push("EXPERIENCE LEVEL:\n");

  const attacks = ps.attacks || {};
  const defends = ps.defends || {};
  const totalAttacks = attacks.total || 0;
  const attackWr = parseFloat(String(attacks.winrate || "0").replace("%", "")) || 0;
  const defendWr = parseFloat(String(defends.winrate || "0").replace("%", "")) || 0;
  const elo = ps.elo || 1000;

  let expLevel = "novice";
  if (totalAttacks >= 5000) expLevel = "elite";
  else if (totalAttacks >= 2000) expLevel = "veteran";
  else if (totalAttacks >= 500) expLevel = "experienced";
  else if (totalAttacks >= 100) expLevel = "developing";

  lines.push(`This member is a ${expLevel} combatant with ${totalAttacks} total attacks. `);

  if (attackWr >= 80) {
    lines.push(`Their ${attackWr.toFixed(1)}% attack win rate is excellent, indicating strong fighting capability and good target selection. `);
  } else if (attackWr >= 70) {
    lines.push(`Their ${attackWr.toFixed(1)}% attack win rate is solid, showing competent combat skills. `);
  } else if (attackWr >= 60) {
    lines.push(`Their ${attackWr.toFixed(1)}% attack win rate is moderate, suggesting they may be challenging themselves or still learning. `);
  } else {
    lines.push(`Their ${attackWr.toFixed(1)}% attack win rate is below average, indicating they may be fighting above their level or need more training. `);
  }

  if (elo >= 2000) {
    lines.push(`With an ELO of ${elo}, they compete at an elite level.`);
  } else if (elo >= 1500) {
    lines.push(`Their ELO of ${elo} shows strong competitive performance.`);
  } else if (elo >= 1200) {
    lines.push(`Their ELO of ${elo} is around average.`);
  } else {
    lines.push(`Their ELO of ${elo} suggests they are still building combat experience.`);
  }

  lines.push("\n\n");
  lines.push("TRAINING COMMITMENT:\n");

  const drugsData = ps.drugs || {};
  const totalDrugs = drugsData.total || 0;
  const xanax = drugsData.xanax || 0;
  const rehabCount = drugsData.rehabilitations?.amount || 0;
  const rehabFees = drugsData.rehabilitations?.fees || 0;

  let trainingLevel = "minimal to none";
  if (rehabFees > 50_000_000) trainingLevel = "very heavy";
  else if (rehabFees > 10_000_000) trainingLevel = "heavy";
  else if (rehabFees > 1_000_000) trainingLevel = "moderate";
  else if (rehabFees > 0) trainingLevel = "light";

  lines.push(`Evidence shows ${trainingLevel} training investment. `);

  if (rehabFees > 0) {
    lines.push(`They have completed ${rehabCount} rehabilitations at a total cost of $${rehabFees.toLocaleString()}, indicating they actively use drug-assisted training. `);

    if (xanax > 500) {
      lines.push(`With ${xanax} Xanax used, they focus heavily on defense training. `);
    } else if (totalDrugs > 300) {
      lines.push(`Their ${totalDrugs} total drugs used shows consistent training habits. `);
    }

    if (rehabFees > 20_000_000) {
      lines.push("This level of investment demonstrates serious dedication to stat development.");
    } else if (rehabFees > 5_000_000) {
      lines.push("This shows a solid commitment to improving their combat stats.");
    }
  } else {
    lines.push("With no rehabilitation history, they likely train naturally or are still early in development.");
  }

  lines.push("\n\n");
  lines.push("ACTIVITY & ENGAGEMENT:\n");

  const activity = ps.activity || {};
  const timePlayed = activity.time || 0;
  const currentStreak = activity.streak?.current || 0;
  const bestStreak = activity.streak?.best || 0;
  const daysPlayed = Math.floor(timePlayed / 1440);

  let activityDesc = "relatively new player";
  if (daysPlayed > 1000) activityDesc = "long-term veteran";
  else if (daysPlayed > 500) activityDesc = "established player";
  else if (daysPlayed > 180) activityDesc = "committed player";

  lines.push(`This is a ${activityDesc} with ${daysPlayed} days of game time. `);

  if (currentStreak >= 365) {
    lines.push(`Their current ${currentStreak}-day login streak is exceptional, demonstrating outstanding dedication. `);
  } else if (currentStreak >= 180) {
    lines.push(`Their ${currentStreak}-day login streak shows excellent daily engagement. `);
  } else if (currentStreak >= 30) {
    lines.push(`Their ${currentStreak}-day login streak indicates regular activity. `);
  } else if (currentStreak >= 7) {
    lines.push(`Their ${currentStreak}-day streak shows recent consistent logins. `);
  } else {
    lines.push(`With a ${currentStreak}-day streak, they have recently returned or are less consistent. `);
  }

  if (bestStreak > currentStreak + 30) {
    lines.push(`Their best streak of ${bestStreak} days suggests they were previously more active.`);
  }

  lines.push("\n\n");
  lines.push("COMBAT STYLE:\n");

  const bestKillstreak = ps.killstreak || 0;
  const oneHitKills = ps.one_hit_kills || 0;
  const hitAccuracy = parseFloat(String(ps.hits?.accuracy || "0").replace("%", "")) || 0;

  if (bestKillstreak >= 50) {
    lines.push(`A ${bestKillstreak}-kill streak demonstrates exceptional sustained performance in combat. `);
  } else if (bestKillstreak >= 20) {
    lines.push(`Their ${bestKillstreak}-kill streak shows good combat consistency. `);
  }

  if (oneHitKills > 500) {
    lines.push(`With ${oneHitKills} one-hit kills, they have significant offensive power. `);
  } else if (oneHitKills > 100) {
    lines.push(`Their ${oneHitKills} one-hit kills indicate developing combat strength. `);
  }

  if (defendWr < 20) {
    lines.push(`Their ${defendWr.toFixed(1)}% defend win rate suggests they are typically outmatched when attacked, which is common for players who punch above their weight or are targeted by stronger opponents.`);
  }

  if (hitAccuracy > 0) {
    lines.push(` Hit accuracy recorded at ${hitAccuracy.toFixed(1)}%.`);
  }

  return lines.join("");
}

export async function fetchPlayerStats(apiKey, playerId, baseUrl = DEFAULT_BASE_URL) {
  const safeBase = baseUrl.replace(/\/$/, "");
  const endpoint = `/user/${playerId}/personalstats,basic?cat=all&stat=`;
  const response = await fetchWithTimeout(
    `${safeBase}${endpoint}`,
    {
      headers: {
        Authorization: `ApiKey ${apiKey}`,
      },
    },
    DEFAULT_TIMEOUT_MS,
    `player:${playerId}`
  );

  if (!response.ok) {
    throw new Error(`Torn API error (${response.status}) for player ${playerId}.`);
  }

  return response.json();
}

export async function fetchFactionMemberIds(apiKey, factionId, baseUrl = DEFAULT_BASE_URL) {
  if (!/^\d+$/.test(String(factionId))) {
    throw new Error("Faction ID must be numeric.");
  }

  const safeBase = baseUrl.replace(/\/$/, "");
  const endpoint = `/faction/${factionId}/members?striptags=true`;
  const response = await fetchWithTimeout(
    `${safeBase}${endpoint}`,
    {
      headers: {
        Authorization: `ApiKey ${apiKey}`,
      },
    },
    DEFAULT_TIMEOUT_MS,
    `faction:${factionId}`
  );

  if (!response.ok) {
    throw new Error(`Torn API error (${response.status}) when fetching faction.`);
  }

  const data = await response.json();
  const members = Array.isArray(data?.members) ? data.members : [];
  const ids = members
    .map((member) => String(member?.id || ""))
    .filter((id) => /^\d+$/.test(id));

  if (!ids.length) {
    throw new Error("No members found or insufficient permissions.");
  }

  return ids;
}

export async function analyzeMember(apiKey, playerId, baseUrl = DEFAULT_BASE_URL) {
  const playerData = await fetchPlayerStats(apiKey, playerId, baseUrl);

  const personalstats = playerData?.personalstats || {};
  if (!Object.keys(personalstats).length) {
    throw new Error(`No personal stats available for ${playerId}.`);
  }

  const profile = playerData?.profile || {};

  return {
    player_id: String(playerId),
    level: profile.level || "N/A",
    age: profile.age || "N/A",
    status: formatStatus(profile.status),
    name: profile.name || "N/A",
    personalstats: formatPersonalStats(personalstats),
    raw_stats: playerData?.battle_stats || {},
  };
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line, idx) => {
    doc.text(line, x, y + idx * lineHeight);
  });
  return y + lines.length * lineHeight;
}

export function generatePdfReport(membersData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  membersData.forEach((member, index) => {
    if (index > 0) doc.addPage();

    let y = 40;
    doc.setFontSize(18);
    doc.text("Member Vetting Report", 40, y);
    y += 24;

    doc.setFontSize(12);
    doc.text(`Name: ${member.name} (ID: ${member.player_id})`, 40, y);
    y += 16;
    doc.text(`Level: ${member.level} | Age: ${member.age} | Status: ${member.status}`, 40, y);
    y += 24;

    const ps = member.personalstats || {};

    doc.setFontSize(13);
    doc.text("Combat Performance", 40, y);
    y += 16;

    doc.setFontSize(10);
    if (ps.attacks) {
      doc.text(`Attacks: ${ps.attacks.total} (W ${ps.attacks.won}, L ${ps.attacks.lost}, S ${ps.attacks.stalemate})`, 40, y);
      y += 14;
      doc.text(`Attack WR: ${ps.attacks.winrate}`, 40, y);
      y += 14;
    }
    if (ps.defends) {
      doc.text(`Defends: ${ps.defends.total} (W ${ps.defends.won}, L ${ps.defends.lost}, S ${ps.defends.stalemate})`, 40, y);
      y += 14;
      doc.text(`Defend WR: ${ps.defends.winrate}`, 40, y);
      y += 14;
    }
    if (ps.hits) {
      doc.text(`Hit Accuracy: ${ps.hits.accuracy}`, 40, y);
      y += 14;
    }
    if (ps.damage) {
      doc.text(`Total Damage: ${ps.damage.total}`, 40, y);
      y += 14;
      doc.text(`Best Hit: ${ps.damage.best}`, 40, y);
      y += 14;
    }
    if (ps.elo != null) {
      doc.text(`ELO: ${ps.elo}`, 40, y);
      y += 14;
    }
    if (ps.killstreak != null) {
      doc.text(`Best Killstreak: ${ps.killstreak}`, 40, y);
      y += 14;
    }
    if (ps.one_hit_kills != null) {
      doc.text(`One-hit Kills: ${ps.one_hit_kills}`, 40, y);
      y += 18;
    }

    if (ps.training) {
      doc.setFontSize(13);
      doc.text("Training", 40, y);
      y += 16;
      doc.setFontSize(10);
      doc.text(`Strength: ${ps.training.strength}`, 40, y);
      y += 14;
      doc.text(`Defence: ${ps.training.defence}`, 40, y);
      y += 14;
      doc.text(`Speed: ${ps.training.speed}`, 40, y);
      y += 14;
      doc.text(`Dexterity: ${ps.training.dexterity}`, 40, y);
      y += 18;
    }

    if (ps.activity) {
      doc.setFontSize(13);
      doc.text("Activity", 40, y);
      y += 16;
      doc.setFontSize(10);
      doc.text(`Time: ${ps.activity.time} mins`, 40, y);
      y += 14;
      doc.text(`Current Streak: ${ps.activity.streak?.current || 0}`, 40, y);
      y += 14;
      doc.text(`Best Streak: ${ps.activity.streak?.best || 0}`, 40, y);
      y += 14;
      doc.text(`Attacks (30d): ${ps.activity.attacks}`, 40, y);
      y += 14;
      doc.text(`Crimes (30d): ${ps.activity.crimes}`, 40, y);
      y += 14;
      doc.text(`Missions (30d): ${ps.activity.missions}`, 40, y);
      y += 14;
      doc.text(`Forum Posts (30d): ${ps.activity.forum_posts}`, 40, y);
      y += 18;
    }

    if (ps.drugs) {
      doc.setFontSize(13);
      doc.text("Drug Usage", 40, y);
      y += 16;
      doc.setFontSize(10);
      doc.text(`Total: ${ps.drugs.total}`, 40, y);
      y += 14;
      doc.text(`Xanax: ${ps.drugs.xanax}`, 40, y);
      y += 14;
      doc.text(`Rehab Count: ${ps.drugs.rehabilitations?.amount || 0}`, 40, y);
      y += 14;
      doc.text(`Rehab Fees: ${ps.drugs.rehabilitations?.fees || 0}`, 40, y);
      y += 18;
    }

    doc.setFontSize(13);
    doc.text("Assessment Summary", 40, y);
    y += 16;
    doc.setFontSize(10);

    const summary = generateSummary(member);
    y = addWrappedText(doc, summary, 40, y, pageWidth - 80, 12);

    if (y > pageHeight - 40) {
      doc.addPage();
    }
  });

  return doc.output("arraybuffer");
}
