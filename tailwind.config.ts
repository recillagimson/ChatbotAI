import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        conv: {
          good: "hsl(var(--conv-good))",
          mid: "hsl(var(--conv-mid))",
          bad: "hsl(var(--conv-bad))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
        },

        /**
         * SpeedSettr dashboard palette - the literal values from the design
         * blueprint (locked to the logo PDF: #6366f1 primary, #1e1b4b navy,
         * white; semantic green/amber/rose for status only).
         *
         * These are deliberately raw hexes rather than themeable HSL vars: the
         * dashboard blueprint is light-theme-only ("the navy is doing the dark
         * work"), and pinning them keeps every screen pixel-consistent with the
         * design. The shadcn `--background`/`--primary` tokens above still drive
         * the marketing site, auth pages and admin area.
         */
        ss: {
          // Deep navy - sidebar, hero panels, dark buttons.
          navy: "#1e1b4b",
          "navy-700": "#2b2566",
          "navy-600": "#332a78",
          "navy-500": "#312e81",

          // Indigo ramp - primary actions, links, chips.
          indigo: "#6366f1",
          "indigo-600": "#4f46e5",
          "indigo-700": "#4338ca",
          "indigo-800": "#3730a3",
          "indigo-350": "#9698f7",
          "indigo-400": "#8b8ef5",
          "indigo-300": "#a5b4fc",
          "indigo-250": "#b4b6f9",
          "indigo-200": "#c3c5fb",
          "indigo-100": "#dcdcfd",
          "indigo-50": "#eef0ff",
          "indigo-25": "#f8f9ff",

          // Surfaces.
          page: "#f6f7fc",
          "page-alt": "#fbfbfe",
          soft: "#f8f9fc",
          chip: "#f1f2f7",

          // Lines.
          line: "#e7e8f3",
          hair: "#f0f1f8",
          "hair-2": "#f4f5fa",
          rule: "#e2e4f0",
          "rule-indigo": "#e2e4f9",
          dash: "#d6d8e8",

          // Text.
          ink: "#1e1b4b",
          body: "#5c5f80",
          muted: "#8b8ea8",
          faint: "#a3a5bd",
          fainter: "#c9cbdd",
          slate: "#6b6e8c",

          // Sidebar-on-navy text ramp.
          "nav-text": "#b6b7d8",
          "nav-dim": "#8f90c4",
          "nav-label": "#6f70a8",
          "nav-meta": "#9c9dcb",

          // Success / green.
          green: "#059669",
          "green-ink": "#046c4e",
          "green-bg": "#e8f8f1",
          "green-line": "#b9e8d3",
          mint: "#34d399",
          "mint-soft": "#86e3b8",
          "mint-text": "#9ee7c6",
          "green-tint": "#f0fdf7",
          "green-deep": "#065f46",

          // Warning / amber.
          amber: "#d97706",
          "amber-ink": "#92400e",
          "amber-bg": "#fff4e5",
          "amber-line": "#fde3c8",
          "amber-tint": "#fffaf3",
          "amber-soft": "#fbbf24",
          "amber-text": "#fcd9a0",

          // Danger / rose.
          rose: "#e11d48",
          "rose-ink": "#be123c",
          "rose-deep": "#9f1239",
          "rose-bg": "#ffe9ee",
          "rose-tint": "#fff5f7",
          "rose-line": "#f6cdd6",
          "rose-soft": "#fca5b5",
          "rose-wash": "#ffe0e7",

          // Channel chips.
          "ig-bg": "#fde8f3",
          "ig-ink": "#be185d",
          "fb-bg": "#e7f0ff",
          "fb-ink": "#1d4ed8",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Design-blueprint radii. The dashboard uses a tight ladder that the
        // default Tailwind scale doesn't cover: controls 9–11px, cards 13–18px.
        ctl: "9px",
        "ctl-lg": "11px",
        chip: "12px",
        panel: "14px",
        card: "16px",
        "card-lg": "18px",
      },
      boxShadow: {
        // Indigo lift under the active sidebar item.
        "ss-nav": "0 8px 18px -8px rgba(99,102,241,.95)",
        // Barely-there card lift used across the dashboard grid.
        "ss-card": "0 1px 2px rgba(30,27,75,.04)",
        // Selected/primary chatbot card.
        "ss-pick": "0 12px 28px -20px rgba(99,102,241,.9)",
        // Chatbot switcher popover.
        "ss-pop":
          "0 28px 60px -22px rgba(30,27,75,.42), 0 4px 12px rgba(30,27,75,.08)",
        // Billing plan card.
        "ss-plan": "0 8px 30px -18px rgba(30,27,75,.25)",
        // Mobile bottom sheet.
        "ss-sheet": "0 -18px 50px -20px rgba(30,27,75,.5)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
