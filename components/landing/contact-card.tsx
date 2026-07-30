import { Mail, Phone, MapPin } from "lucide-react";
import { COMPANY } from "@/lib/company";

/**
 * Contact card that sits directly above the site footer on every public page.
 * Pulls its values from lib/company so the footer, the legal documents and
 * this card can never disagree.
 */
export function ContactCard() {
  return (
    <section className="relative z-10">
      <div className="container pb-16 pt-4 sm:pb-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#6366f1]/20 blur-3xl"
          />

          <div className="relative">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">
              Talk to a real person
            </h2>
            <p className="mt-2 text-sm text-white/55">
              Questions about setup, billing or anything else? Reach us any of
              these ways.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-8">
              {/* Email */}
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6366f1]/20 text-[#a5b4fc]">
                  <Mail className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                    Email
                  </div>
                  <a
                    href={`mailto:${COMPANY.email}`}
                    className="mt-1 block break-words text-[15px] text-white/80 transition-colors hover:text-white"
                  >
                    {COMPANY.email}
                  </a>
                </div>
              </div>

              {/* Hotline */}
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6366f1]/20 text-[#a5b4fc]">
                  <Phone className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                    Hotline
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {COMPANY.phones.map((p) => (
                      <a
                        key={p.tel}
                        href={`tel:${p.tel}`}
                        className="block text-[15px] text-white/80 transition-colors hover:text-white"
                      >
                        {p.display}
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {/* Office */}
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6366f1]/20 text-[#a5b4fc]">
                  <MapPin className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                    Office
                  </div>
                  <address className="mt-1 text-[15px] not-italic text-white/80">
                    {COMPANY.address}
                  </address>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
