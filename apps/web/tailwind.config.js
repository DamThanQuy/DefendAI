/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Deep dark base (CodeRabbit.ai style)
        background: "#09090B",
        surface: "#161B26",
        foreground: "#E4E4E7",
        muted: {
          DEFAULT: "#18181B",
          foreground: "#A1A1AA",
        },
        border: "#27272A",
        // Teal brand accent
        primary: {
          DEFAULT: "#0D9488",
          foreground: "#ECFEFF",
        },
        // Status (muted dark vibe)
        critical: { DEFAULT: "#F87171", bg: "#450A0A", border: "#7F1D1D" },
        warning: { DEFAULT: "#FBBF24", bg: "#422006", border: "#78350F" },
        success: { DEFAULT: "#2DD4BF", bg: "#042F2E", border: "#134E4A" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 20px rgba(13,148,136,0.05)",
      },
    },
  },
  plugins: [],
};
