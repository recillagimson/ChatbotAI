import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The link-preview card. Whenever the site is pasted into iMessage, Messenger,
 * WhatsApp, Slack, LinkedIn, X or a Google result, this is the image that
 * renders above the title.
 *
 * It wears the HighThrive.ai brand to match the public landing (app/page.tsx):
 * near-black + gold, the rising-arrow mark, and the hero headline.
 *
 * Built with next/og (Satori) rather than a hand-exported PNG so the copy and
 * the brand colours stay in one place - edit the strings below and every
 * unfurled link updates on the next deploy.
 *
 * Fonts are read off disk (assets/fonts) instead of fetched from Google at
 * request time: a network hiccup there would fail the route and the link would
 * unfurl with no image at all.
 */

export const alt =
  "HighThrive.ai - AI that answers your DMs while you sleep";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens, mirrored from the landing page.
const PAGE = "#0A0A0C";
const GOLD = "#E8B644";
const GOLD_SOFT = "#D9B262";
const INK = "#F4F1EA";
const MUTED = "#A9A499";

/** The HighThrive.ai mark (same geometry as components/brand/highthrive-mark.tsx). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <g
        stroke={GOLD}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M14 48 L30 26 M30 26 L48 20 M14 48 L22 68 M22 68 L48 20"
          strokeWidth="2"
          opacity="0.6"
        />
        <polyline points="16,76 40,52 54,66 79,31" strokeWidth="9" />
      </g>
      <g fill={GOLD}>
        <circle cx="14" cy="48" r="5" />
        <circle cx="30" cy="26" r="4" />
        <circle cx="48" cy="20" r="5.5" />
        <circle cx="22" cy="68" r="3.5" />
        <polygon points="88,18 88,46 60,22" />
      </g>
    </svg>
  );
}

export default async function OpengraphImage() {
  const [display, body] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Outfit-ExtraBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/PlusJakartaSans-SemiBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: PAGE,
          backgroundImage: `radial-gradient(90% 75% at 100% 0%, #2A2110 0%, #16130C 45%, ${PAGE} 100%)`,
          fontFamily: "Jakarta",
          color: INK,
          position: "relative",
        }}
      >
        {/* Faint grid, drawn as plain divs - Satori has no repeating-gradient. */}
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={`v${i}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: (i + 1) * 100,
              width: 1,
              backgroundColor: "rgba(244,241,234,0.03)",
            }}
          />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={`h${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: (i + 1) * 105,
              height: 1,
              backgroundColor: "rgba(244,241,234,0.03)",
            }}
          />
        ))}

        {/* Top: brand + eyebrow pill */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Mark size={52} />
            <div
              style={{
                display: "flex",
                fontSize: 34,
                letterSpacing: -0.8,
                color: GOLD,
              }}
            >
              HighThrive.ai
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 30 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid rgba(232,182,68,0.34)",
                backgroundColor: "rgba(232,182,68,0.10)",
                borderRadius: 999,
                padding: "9px 18px",
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  backgroundColor: "#2F9E6B",
                }}
              />
              <div
                style={{
                  fontSize: 19,
                  letterSpacing: 1.6,
                  color: GOLD_SOFT,
                  textTransform: "uppercase",
                }}
              >
                AI Setter &amp; Closer for your DMs
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Outfit",
              fontSize: 84,
              lineHeight: 1.04,
              letterSpacing: -2.6,
            }}
          >
            <div style={{ display: "flex" }}>Your DMs get answered</div>
            <div style={{ display: "flex", color: GOLD }}>while you sleep.</div>
          </div>

          <div
            style={{
              display: "flex",
              width: 132,
              height: 7,
              borderRadius: 7,
              marginTop: 28,
              background: `linear-gradient(90deg, ${GOLD}, rgba(232,182,68,0))`,
            }}
          />
        </div>

        {/* Footer: proof line + domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: MUTED }}>
            Replies in seconds · Trained on your business · Books the calls
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Outfit",
              fontSize: 26,
              color: GOLD,
            }}
          >
            highthrive.ai
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Outfit", data: display, weight: 800, style: "normal" },
        { name: "Jakarta", data: body, weight: 600, style: "normal" },
      ],
    },
  );
}
