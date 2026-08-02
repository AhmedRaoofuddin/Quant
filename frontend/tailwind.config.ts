import type { Config } from "tailwindcss";

/** Alpha-Forge palette: neutral near-black, one accent, semantic up/down only. */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        line: "rgb(var(--border) / <alpha-value>)",
        "line-strong": "rgb(var(--border-strong) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        up: "rgb(var(--up) / <alpha-value>)",
        down: "rgb(var(--down) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        grid: "rgb(var(--grid) / <alpha-value>)",
        // Back-compat aliases so existing chart code keeps compiling.
        panel: "rgb(var(--surface) / <alpha-value>)",
        "panel-2": "rgb(var(--bg) / <alpha-value>)",
        header: "rgb(var(--raised) / <alpha-value>)",
        "line-2": "rgb(var(--border-strong) / <alpha-value>)",
        green: "rgb(var(--up) / <alpha-value>)",
        red: "rgb(var(--down) / <alpha-value>)",
        amber: "rgb(var(--warn) / <alpha-value>)",
        blue: "rgb(var(--accent) / <alpha-value>)",
        cyan: "rgb(var(--accent) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "6px", DEFAULT: "8px", lg: "10px", xl: "14px" },
    },
  },
  plugins: [],
};

export default config;
