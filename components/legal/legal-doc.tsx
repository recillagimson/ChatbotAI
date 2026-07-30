import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";

/* ---------------------------------------------------------------------------
   Shared building blocks for the public legal documents. Keeps every policy
   page visually identical, so new ones (terms, disclaimer, refund, etc.) only
   need their copy, not their styling.
--------------------------------------------------------------------------- */

export function LegalDoc({
  title,
  updated,
  effective,
  children,
}: {
  title: string;
  /** e.g. "July 31, 2026" */
  updated: string;
  /** Optional. Rendered before "Last Updated" when the doc states both. */
  effective?: string;
  children: ReactNode;
}) {
  return (
    <article className="container max-w-3xl py-16 sm:py-20">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-sm text-white/50">
        {effective && (
          <>
            Effective Date: {effective}{" "}
            <span className="px-1 text-white/25">|</span>{" "}
          </>
        )}
        Last Updated: {updated}
      </p>
      <div className="mt-10 space-y-8">{children}</div>
    </article>
  );
}

/** Numbered top-level section. */
export function Section({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
        {n !== undefined && (
          <span className="mr-2 text-[#a5b4fc]">{n}.</span>
        )}
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

/** Body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed text-white/65">{children}</p>
  );
}

/** Bold run-in label used inside a paragraph, e.g. "Information You Provide:" */
export function Lead({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-white/90">{children}</strong>;
}

/** Sub-heading inside a section. */
export function SubHead({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-2 text-[15px] font-semibold text-white/90">{children}</h3>
  );
}

/** Bulleted list. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-white/65">
          <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#a5b4fc]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Highlighted contact / address block. */
export function ContactBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[15px] leading-relaxed text-white/70">
      {children}
    </div>
  );
}

const linkClass = "text-[#a5b4fc] underline-offset-4 hover:underline";

/** Inline mailto link to the company address. */
export function MailLink() {
  return (
    <a href={`mailto:${COMPANY.email}`} className={linkClass}>
      {COMPANY.email}
    </a>
  );
}

/** External link styled to match legal-document body copy. */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      {children}
    </a>
  );
}

/** Full name / address / email / phone card used at the end of each document. */
export function CompanyContact() {
  return (
    <ContactBlock>
      <div className="font-semibold text-white">{COMPANY.name}</div>
      <div>{COMPANY.address}</div>
      <div className="mt-2">
        Email: <MailLink />
      </div>
      <div>
        Phone:{" "}
        {COMPANY.phones.map((p, i) => (
          <span key={p.tel}>
            {i > 0 && " / "}
            <a href={`tel:${p.tel}`} className={linkClass}>
              {p.display}
            </a>
          </span>
        ))}
      </div>
    </ContactBlock>
  );
}

/** Placeholder body for legal pages whose copy hasn't been supplied yet. */
export function ComingSoon({ document }: { document: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <p className="text-[15px] leading-relaxed text-white/65">
        Our {document} is being finalized and will be published here shortly.
      </p>
      <p className="mt-3 text-sm text-white/45">
        For questions in the meantime, contact{" "}
        <a
          href="mailto:admin@speedsettr.com"
          className="text-[#a5b4fc] underline-offset-4 hover:underline"
        >
          admin@speedsettr.com
        </a>
        .
      </p>
    </div>
  );
}
