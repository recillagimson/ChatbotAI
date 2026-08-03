import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The link-preview card. Whenever speedsettr.com is pasted into iMessage,
 * Messenger, WhatsApp, Slack, LinkedIn, X or a Google result, this is the image
 * that renders above the title.
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
  "SpeedSettr - AI that answers your Instagram, Facebook and TikTok DMs in seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens, mirrored from globals.css / the landing page.
const NAVY = "#15123a";
const CARD_EDGE = "#2e2c6d";
const INDIGO = "#6366f1";
const INDIGO_SOFT = "#a5b4fc";
const MUTED = "#b6b4dd";

export default async function OpengraphImage() {
  const [display, body, logo] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Outfit-ExtraBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/PlusJakartaSans-SemiBold.ttf")),
    readFile(join(process.cwd(), "public/brand/logo-lockup.png")),
  ]);

  // The full-colour lockup on a white chip - the same treatment the app uses on
  // every dark surface (sidebar, hero, auth panel), so the navy "SPEED" in the
  // wordmark stays legible here too.
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 72px",
          backgroundColor: NAVY,
          backgroundImage: `radial-gradient(110% 80% at 12% 0%, ${CARD_EDGE} 0%, #221f52 42%, #19163e 82%, ${NAVY} 100%)`,
          fontFamily: "Jakarta",
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
              backgroundColor: "rgba(255,255,255,0.035)",
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
              backgroundColor: "rgba(255,255,255,0.035)",
            }}
          />
        ))}

        {/* Indigo glow, top-right, matching the hero orb. */}
        <div
          style={{
            position: "absolute",
            top: -190,
            right: -140,
            width: 620,
            height: 620,
            borderRadius: 620,
            background:
              "radial-gradient(circle, rgba(99,102,241,0.34), rgba(99,102,241,0) 68%)",
          }}
        />

        {/* Top: logo chip + status pill */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                backgroundColor: "#ffffff",
                borderRadius: 18,
                padding: "13px 20px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} width={193} height={56} alt="SpeedSettr" />
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 26 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid rgba(165,180,252,0.34)",
                backgroundColor: "rgba(99,102,241,0.16)",
                borderRadius: 999,
                padding: "9px 18px",
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 9,
                  backgroundColor: "#34d399",
                }}
              />
              <div
                style={{
                  fontSize: 19,
                  letterSpacing: 1.6,
                  color: INDIGO_SOFT,
                  textTransform: "uppercase",
                }}
              >
                AI DM Replies · Live in 10 Minutes
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: "Outfit",
              fontSize: 82,
              lineHeight: 1.04,
              letterSpacing: -2.4,
              color: "#ffffff",
            }}
          >
            <div style={{ display: "flex" }}>Never Miss a DM.</div>
            <div style={{ display: "flex", color: INDIGO_SOFT }}>
              Never Miss a Sale.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 132,
              height: 7,
              borderRadius: 7,
              marginTop: 30,
              background: `linear-gradient(90deg, ${INDIGO}, rgba(99,102,241,0))`,
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
            Answers in seconds · Trained on your business · You take over any time
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Outfit",
              fontSize: 26,
              color: INDIGO_SOFT,
            }}
          >
            speedsettr.com
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
