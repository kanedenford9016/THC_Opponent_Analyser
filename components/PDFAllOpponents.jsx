"use client";

import jsPDF from "jspdf";

// ---- BAR COLOR ----
function getBarColor(value, type) {
  if (type === "threat") {
    if (value < 30) return "#2ecc71";
    if (value < 60) return "#f1c40f";
    if (value < 90) return "#e67e22";
    return "#e74c3c";
  } else {
    if (value > 70) return "#2ecc71";
    if (value > 40) return "#f1c40f";
    return "#e74c3c";
  }
}

// ---- BAR ----
function drawBar(doc, x, y, width, percent, color) {
  const barHeight = 5;
  const filledWidth = (percent / 100) * width;

  doc.setFillColor("#222222");
  doc.rect(x, y, width, barHeight, "F");

  doc.setFillColor(color);
  doc.rect(x, y, filledWidth, barHeight, "F");
}

// ---- SECTION HEADER (uses dynamic width) ----
function drawSectionHeader(doc, text, x, y, width) {
  doc.setFillColor("#A30088");
  doc.rect(x, y, width, 14, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor("#ffffff");
  doc.text(text, x + 4, y + 10);
}

// ---- ROW (multi-line, wraps inside box) ----
function drawRow(doc, text, x, y, width) {
  const paddingX = 4;
  const firstLineOffsetY = 10; // baseline for first line
  const lineHeight = 11;

  const maxTextWidth = width - paddingX * 2;

  // Split text to fit within the box width
  const lines = doc.splitTextToSize(text, maxTextWidth);

  // Box height: top padding + lineHeight * #lines + a bit of bottom padding
  const boxHeight = firstLineOffsetY + lineHeight * (lines.length - 1) + 6;

  // Background box
  doc.setFillColor("#1c1c1c");
  doc.rect(x, y, width, boxHeight, "F");

  // Text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#dddddd");

  lines.forEach((line, idx) => {
    const ty = y + firstLineOffsetY + idx * lineHeight;
    doc.text(line, x + paddingX, ty);
  });

  // Return next y position
  return y + boxHeight + 2;
}

// ---- GLOW ----
function drawGlow(doc, x, y, w, h) {
  // Purple glow rectangle behind card
  doc.setFillColor(163, 0, 136, 40); // semi-transparent purple
  doc.rect(x - 8, y - 8, w + 16, h + 16, "F");
}

// ---- DRAW FULL CARD ----
function drawOpponentCard(doc, opp, cardX, cardY, cardW, cardH) {
  const result = opp.result;
  if (!result) return;

  const innerMargin = 12;
  const contentX = cardX + innerMargin;
  const contentWidth = cardW - innerMargin * 2;

  // Glow behind the card
  drawGlow(doc, cardX, cardY, cardW, cardH - 10);

  // CARD BACKGROUND
  doc.setFillColor("#151515");
  doc.roundedRect(cardX, cardY, cardW, cardH - 10, 8, 8, "F");

  // BORDER
  doc.setDrawColor("#A30088");
  doc.setLineWidth(0.6);
  doc.roundedRect(cardX, cardY, cardW, cardH - 10, 8, 8, "S");

  let cy = cardY + 20;

  // TITLE
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor("#A30088");
  doc.text(`${opp.name} (${opp.id})`, contentX, cy);
  cy += 16;

  // STYLE
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#dddddd");
  if (result.style) {
    doc.text(`Style: ${result.style}`, contentX, cy);
    cy += 14;
  }

  // ---- THREAT ----
  if (typeof result.threat === "number") {
    const threatPct = Math.round(result.threat);
    doc.text(`Threat: ${threatPct}%`, contentX, cy);
    drawBar(
      doc,
      contentX,
      cy + 4,
      contentWidth * 0.75,
      threatPct,
      getBarColor(threatPct, "threat")
    );
    cy += 22;
  }

  // ---- WIN CHANCE ----
  if (typeof result.confidence === "number") {
    const winPct = Math.round(result.confidence);
    doc.text(`Win Chance: ${winPct}%`, contentX, cy);
    drawBar(
      doc,
      contentX,
      cy + 4,
      contentWidth * 0.75,
      winPct,
      getBarColor(winPct, "confidence")
    );
    cy += 20;
  }

  // Strengths
  if (result.strengths?.length > 0) {
    drawSectionHeader(doc, "Strengths", contentX, cy, contentWidth);
    cy += 16;
    result.strengths.forEach((s) => {
      cy = drawRow(doc, s, contentX, cy, contentWidth);
    });
    cy += 4;
  }

  // Weaknesses
  if (result.weaknesses?.length > 0) {
    drawSectionHeader(doc, "Weaknesses", contentX, cy, contentWidth);
    cy += 16;
    result.weaknesses.forEach((s) => {
      cy = drawRow(doc, s, contentX, cy, contentWidth);
    });
    cy += 4;
  }

  // Strategy
  if (result.strategy?.length > 0) {
    drawSectionHeader(doc, "Strategy", contentX, cy, contentWidth);
    cy += 16;
    result.strategy.forEach((s) => {
      cy = drawRow(doc, s, contentX, cy, contentWidth);
    });
  }
}

// --------- HELPER: detect if opponent is unlocked on screen ---------
function isUnlockedOpponent(opp) {
  const r = opp.result || opp;

  return (
    opp.isUnlocked === true ||
    opp.unlocked === true ||
    r?.unlocked === true ||
    r?.unlockStatus === "unlocked" ||
    r?.advancedUnlocked === true
  );
}

export default function PDFAllOpponents({ opponents }) {
  const generatePDF = () => {
    if (!opponents || opponents.length === 0) {
      alert("No opponents to export.");
      return;
    }

    // 🔥 Only export opponents that are currently unlocked on screen
    const unlockedOpponents = opponents.filter(
      (opp) => opp.result && isUnlockedOpponent(opp)
    );

    if (unlockedOpponents.length === 0) {
      alert(
        "No unlocked opponents to export. Unlock advanced intel for a target first."
      );
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const paintBackground = () => {
      doc.setFillColor(0, 0, 0); // full black page
      doc.rect(0, 0, pageWidth, pageHeight, "F");
    };

    const drawTitle = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor("#A30088");
      doc.text("THC Edge — Multi Opponent Report", pageWidth / 2, 35, {
        align: "center",
      });
    };

    // FIRST PAGE
    paintBackground();
    drawTitle();

    // CARD GRID
    const topY = 50;
    const leftX = 35;
    const rightX = pageWidth / 2 + 5;

    const cardH = (pageHeight - 80) / 2;
    const cardW = pageWidth / 2 - 45;

    unlockedOpponents.forEach((opp, idx) => {
      if (!opp.result) return;

      if (idx > 0 && idx % 4 === 0) {
        doc.addPage();
        paintBackground();
        drawTitle();
      }

      const slot = idx % 4;
      const col = slot % 2;
      const row = slot < 2 ? 0 : 1;

      const cardX = col === 0 ? leftX : rightX;
      const cardY = topY + row * cardH;

      drawOpponentCard(doc, opp, cardX, cardY, cardW, cardH);
    });

    doc.save("THC_Edge_Multi_Report.pdf");
  };

  return (
    <button className="thc-btn w-full mt-4" onClick={generatePDF}>
      Export Unlocked to PDF
    </button>
  );
}
