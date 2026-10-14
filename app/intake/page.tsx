import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import { HighThriveMark } from "@/components/brand/highthrive-mark";
import { IntakeForm } from "@/components/intake/intake-form";

/**
 * /intake - the public client questionnaire. No login: we send the link to a new
 * client, they answer, and the answers land in Admin > Intakes. Unlisted on purpose
 * (noindex, not in the sitemap): it is a link we hand out, not a marketing page.
 * Same dark + gold look as /book-a-call.
 */
export const metadata: Metadata = {
  title: "Client questionnaire | HighThrive.ai",
  description: "Tell us how you talk and how you sell, so your DM assistant sounds like you.",
  robots: { index: false, follow: false },
};

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500"],
});

export default function IntakePage() {
  return (
    <div
      className={`${jetbrainsMono.variable} flex min-h-dvh flex-col font-[family-name:var(--font-display)] text-[#F4F1EA] antialiased`}
      style={{
        backgroundColor: "#0A0A0C",
        backgroundImage:
          "radial-gradient(90% 60% at 72% 6%, rgba(232,182,68,0.12) 0%, rgba(232,182,68,0) 58%)",
      }}
    >
      <header className="border-b border-[#F4F1EA]/[0.08] bg-[rgba(10,10,12,0.72)] backdrop-blur-[20px]">
        <nav className="mx-auto flex w-full max-w-[760px] items-center gap-6 px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[#E8B644] transition-colors hover:text-[#F7D377]"
            aria-label="HighThrive.ai home"
          >
            <HighThriveMark size={26} />
            <span className="text-lg font-semibold tracking-[-0.025em]">HighThrive.ai</span>
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-24 pt-12 sm:px-6">
        <div className="font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]">
          Client questionnaire
        </div>
        <h1 className="mt-4 text-balance text-[clamp(32px,5vw,46px)] font-semibold leading-[1.06] tracking-[-0.035em]">
          Make your DM assistant sound like you
        </h1>
        <p className="mt-5 max-w-[36em] text-pretty text-[16.5px] leading-[1.6] text-[#A9A499]">
          We already know the services: credit repair and funding. These questions are about you: your
          story, how you talk and how you sell. Your assistant replies to your Instagram DMs as you, so the
          more it sounds like you, the more leads trust it and sign up.
        </p>
        <p className="mt-3 max-w-[36em] text-[14.5px] leading-[1.6] text-[#8A8579]">
          Short answers are fine. Real examples beat descriptions: when a question asks how you&apos;d reply,
          type it exactly the way you would in a DM. Takes about 20 minutes. Only your name, Instagram and email
          are required.
        </p>

        <div className="mt-10">
          <IntakeForm />
        </div>
      </main>
    </div>
  );
}
