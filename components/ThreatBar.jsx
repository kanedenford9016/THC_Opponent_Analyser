"use client";

/* -------------------------------------------------------------
   COLOR INTERPOLATION HELPERS
------------------------------------------------------------- */

// convert hex → RGB
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// lerp between two colors: 0 = start, 1 = end
function lerpColor(start, end, t) {
  return {
    r: Math.round(start.r + (end.r - start.r) * t),
    g: Math.round(start.g + (end.g - start.g) * t),
    b: Math.round(start.b + (end.b - start.b) * t),
  };
}

// format rgb → css
function rgbToCss(c) {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/* -------------------------------------------------------------
   COLOR SCALES
------------------------------------------------------------- */

// Red → Yellow → Green (for threat)
function threatColor(value) {
  // 0–50 → red -> yellow
  // 50–100 → yellow -> green

  const red = hexToRgb("#9e0000");
  const yellow = hexToRgb("#f1c40f");
  const green = hexToRgb("#2ecc71");

  if (value <= 50) {
    const t = value / 50;
    return rgbToCss(lerpColor(red, yellow, t));
  } else {
    const t = (value - 50) / 50;
    return rgbToCss(lerpColor(yellow, green, t));
  }
}

// Green → Yellow → Red (for win chance)
function winColor(value) {
  const green = hexToRgb("#2ecc71");
  const yellow = hexToRgb("#f1c40f");
  const red = hexToRgb("#9e0000");

  if (value <= 50) {
    const t = value / 50;
    return rgbToCss(lerpColor(red, yellow, t)); 
  } else {
    const t = (value - 50) / 50;
    return rgbToCss(lerpColor(yellow, green, t)); 
  }
}

/* -------------------------------------------------------------
   COMPONENT
------------------------------------------------------------- */

export default function ThreatBar({ value, type }) {
  const percent = Math.max(0, Math.min(100, Math.round(value || 0)));

  const color =
    type === "win"
      ? winColor(percent)      // reversed scale
      : threatColor(percent);  // normal scale

  return (
    <div className="w-full">
      <div className="w-full h-2 bg-white/10 rounded">
        <div
          className="h-2 rounded transition-all duration-300"
          style={{
            width: `${percent}%`,
            backgroundColor: color,
          }}
        ></div>
      </div>
    </div>
  );
}
