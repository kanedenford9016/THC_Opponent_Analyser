/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        thcMagenta: "#ff006e",
        thcCard: "#121212",
        thcPanel: "#0a0a0a"
      },
      boxShadow: {
        "thc-glow": "0 0 20px rgba(255, 0, 110, 0.25)"
      }
    }
  },
  plugins: []
}
