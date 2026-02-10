"use client";
import jsPDF from "jspdf";

export default function PDFButton({ data }) {
  if (!data) return null;

  const savePDF = () => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("THC Edge Analysis Report", 10, 15);

    doc.setFontSize(12);
    doc.text(`Style: ${data.style}`, 10, 30);
    doc.text(`Threat: ${data.threat.toFixed(1)}`, 10, 40);
    doc.text(`Confidence: ${data.confidence}%`, 10, 50);

    doc.text("Strengths:", 10, 65);
    data.strengths.forEach((s, i) => doc.text(`- ${s}`, 15, 75 + i * 8));

    doc.text("Weaknesses:", 10, 115);
    data.weaknesses.forEach((w, i) => doc.text(`- ${w}`, 15, 125 + i * 8));

    doc.text("Strategy:", 10, 165);
    data.strategy.forEach((s, i) => doc.text(`- ${s}`, 15, 175 + i * 8));

    doc.save("thc-edge-report.pdf");
  };

  return (
    <button className="thc-btn w-full mt-4" onClick={savePDF}>
      Export PDF
    </button>
  );
}
