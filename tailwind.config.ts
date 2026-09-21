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
         * App palette (dashboard + admin) - HighThrive dark + gold, matching the
         * public landing and the auth screens (re-themed 2026-09-21; it was the
         * light SpeedSettr navy/indigo blueprint before).
         *
         * The token NAMES are the old roles, kept so ~1,000 call sites didn't
         * have to be renamed: `indigo-*` is now the gold accent ramp, `navy-*`
         * is the gold-tinted emphasis surface, `ink/body/muted/faint` are the
         * warm off-white text ladder. Read a token by its role, not its name.
         *
         * Raw hexes (not HSL vars) on purpose: `ss-*` is used ONLY inside the
         * signed-in app shell (no public page references it), so a global value
         * can't leak, and hexes keep Tailwind's `/opacity` modifiers working. The
         * shadcn `--background`/`--primary` vars are re-pointed for the app in
         * globals.css (scoped to `html:has([data-app-shell])`).
         */
        ss: {
          // Surfaces. `surface` replaces the old white card/header fill.
          page: "#0A0A0C", // app ground (= landing bg)
          "page-alt": "#0E0F12", // inset / "soft" card tone
          soft: "#0C0D10", // empty-state well: recessed below the card surface
          chip: "#1B1C22", // neutral chip, hover fill for rows/buttons
          surface: "#111216", // cards, page header strip, panels
          "surface-2": "#15161B", // raised: popovers, sheets, menus
          rail: "#0D0E11", // sidebar / drawer / admin rail

          // Gold-tinted emphasis surface (was navy): hero panels, the
          // secondary-commit button, the human-agent bubble.
          navy: "#1A1710",
          "navy-700": "#262113",
          "navy-600": "#2E2715",
          "navy-500": "#3A3119",

          // Gold accent ramp (was indigo). Solid fills take `text-ss-on-accent`
          // (dark), never white - white on gold is ~1.9:1.
          indigo: "#E8B644", // primary solid, rings, dots
          "indigo-600": "#F2C85C", // links / hover of primary (lighter on dark)
          "indigo-700": "#F0C458", // text on gold-tint chips
          "indigo-800": "#F5D27A", // link hover
          "indigo-350": "#D4A13A",
          "indigo-400": "#C9952A", // chart ramp
          "indigo-300": "#D9AE4E", // accent text on the dark rail/panels
          "indigo-250": "#8A6A22", // chart ramp
          "indigo-200": "#6A521C", // selected borders, secondary series
          "indigo-100": "#3A2E14", // gold-tint fill hover; dark text on gold
          "indigo-50": "#1E1809", // gold-tint chip / soft-button fill
          "indigo-25": "#14120B", // barely-tinted "we suggest" card
          "on-accent": "#141414", // text/icons sitting ON a gold fill

          // Lines.
          line: "#26272D", // the single card hairline
          hair: "#1C1D22", // inner dividers
          "hair-2": "#1A1B20",
          rule: "#2A2B31", // tracks, rules
          "rule-indigo": "#3A2E14", // hairline of gold-tinted cards
          dash: "#34353C", // dashed borders, idle dots, scrollbar thumb

          // Text (warm off-white ladder, from the landing).
          ink: "#F4F1EA",
          body: "#C8C3B7",
          muted: "#A9A499",
          faint: "#8A8579",
          fainter: "#5E5A52",
          slate: "#B3AEA2",

          // Sidebar-on-rail text ramp.
          "nav-text": "#C8C3B7",
          "nav-dim": "#8A8579",
          "nav-label": "#6E6A61",
          "nav-meta": "#A9A499",

          // Success / green (lifted for a dark ground).
          green: "#34D399",
          "green-ink": "#6EE7B7",
          "green-bg": "#0F241C",
          "green-line": "#1F4535",
          mint: "#34d399",
          "mint-soft": "#86e3b8",
          "mint-text": "#9ee7c6",
          "green-tint": "#0C1A15",
          "green-deep": "#A7F3D0",

          // Warning / amber. Solid stays #d97706 so white-on-amber badges keep
          // their existing contrast; the ink/tints are the dark-ground versions.
          amber: "#d97706",
          "amber-ink": "#FCD34D",
          "amber-bg": "#2A1F0B",
          "amber-line": "#4A3510",
          "amber-tint": "#1A140A",
          "amber-soft": "#fbbf24",
          "amber-text": "#fcd9a0",

          // Danger / rose.
          rose: "#E8385A",
          "rose-ink": "#FDA4AF",
          "rose-deep": "#FECDD3",
          "rose-bg": "#2A1016",
          "rose-tint": "#1A0C10",
          "rose-line": "#4A1A26",
          "rose-soft": "#fca5b5",
          "rose-wash": "#3A141D",

          // Channel chips.
          "ig-bg": "#2A1022",
          "ig-ink": "#F9A8D4",
          "fb-bg": "#0F1A33",
          "fb-ink": "#93C5FD",
          "tg-bg": "#0B2130",
          "tg-ink": "#7DD3FC",
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
        // Gold lift under the active sidebar item.
        "ss-nav": "0 8px 18px -8px rgba(201,149,42,.6)",
        // Barely-there card lift used across the dashboard grid.
        "ss-card": "0 1px 2px rgba(0,0,0,.4)",
        // Selected/primary chatbot card.
        "ss-pick": "0 12px 28px -20px rgba(232,182,68,.55)",
        // Chatbot switcher popover.
        "ss-pop":
          "0 28px 60px -22px rgba(0,0,0,.75), 0 4px 12px rgba(0,0,0,.4)",
        // Billing plan card.
        "ss-plan": "0 8px 30px -18px rgba(0,0,0,.7)",
        // Mobile bottom sheet.
        "ss-sheet": "0 -18px 50px -20px rgba(0,0,0,.75)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
