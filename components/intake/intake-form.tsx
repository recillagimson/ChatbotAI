"use client";

import { useEffect, useRef, useState } from "react";
import { INTAKE_SECTIONS, intakeDefaults, otherKey, type IntakeQuestion } from "@/lib/intake";

type Values = Record<string, string | string[]>;

// The form is long, so a half-finished answer survives a closed tab or a reload. It
// lives only in this browser and is cleared once the answers are sent.
const DRAFT_KEY = "intake-draft-v2";

const field =
  "disabled:cursor-not-allowed disabled:opacity-60 w-full rounded-xl border border-[#F4F1EA]/[0.14] bg-[#141418] px-3.5 py-2.5 text-[15px] text-[#F4F1EA] placeholder:text-[#6F6B62] outline-none transition-colors focus:border-[#E8B644]/70 focus:ring-2 focus:ring-[#E8B644]/25";

export function IntakeForm() {
  const [values, setValues] = useState<Values>(() => intakeDefaults());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setValues({ ...intakeDefaults(), ...(JSON.parse(raw) as Values) });
    } catch {
      /* no saved draft */
    }
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current || state === "sent") return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      /* storage unavailable: the form still works */
    }
  }, [values, state]);

  const set = (id: string, v: string | string[]) => {
    setValues((prev) => ({ ...prev, [id]: v }));
    if (errors[id]) setErrors((prev) => ({ ...prev, [id]: "" }));
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setState("sending");
    const website = (new FormData(e.currentTarget).get("website") as string) || "";
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: values, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      if (!res.ok) {
        setErrors(data.fields ?? {});
        setFormError(data.error ?? "Something went wrong. Please try again.");
        setState("idle");
        const first = data.fields && Object.keys(data.fields)[0];
        if (first) document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setState("sent");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="rounded-[24px] border border-[#E8B644]/25 bg-[#141418] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#E8B644]/30 bg-[#1E1809] text-[#E8B644]">
          <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" aria-hidden>
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Got it, thank you</h2>
        <p className="mx-auto mt-3 max-w-[32em] text-[15.5px] leading-[1.6] text-[#A9A499]">
          We have your answers. We&apos;ll use them to build your assistant in your voice and reach out on the
          email you gave us with next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-10">
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {INTAKE_SECTIONS.map((s, i) => (
        <section key={s.id} aria-labelledby={`s-${s.id}`} className="grid gap-6">
          <div>
            <div className="font-[family-name:var(--font-mono)] text-[10.5px] uppercase tracking-[0.14em] text-[#8A8579]">
              Part {i + 1} of {INTAKE_SECTIONS.length}
            </div>
            <h2 id={`s-${s.id}`} className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-balance">
              {s.title}
            </h2>
            {s.intro && <p className="mt-2 max-w-[38em] text-[15px] leading-[1.6] text-[#A9A499]">{s.intro}</p>}
          </div>
          {s.questions.map((q) => (
            <Question key={q.id} q={q} values={values} error={errors[q.id]} set={set} />
          ))}
        </section>
      ))}

      <div className="grid gap-3 border-t border-[#F4F1EA]/[0.09] pt-6">
        {formError && (
          <p role="alert" className="rounded-xl border border-[#E5484D]/40 bg-[#2A1215] px-4 py-3 text-[14.5px] text-[#FFB4B4]">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={state === "sending"}
          className="w-full rounded-full bg-[#E8B644] px-6 py-3.5 text-[15.5px] font-semibold text-[#141414] transition-colors hover:bg-[#F7D377] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F7D377] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0C] disabled:opacity-60 sm:w-auto sm:justify-self-start"
        >
          {state === "sending" ? "Sending..." : "Send my answers"}
        </button>
        <p className="text-[13px] text-[#8A8579]">
          Your answers save in this browser as you type, so you can come back and finish later.
        </p>
      </div>
    </form>
  );
}

function Question({
  q,
  values,
  error,
  set,
}: {
  q: IntakeQuestion;
  values: Values;
  error?: string;
  set: (id: string, v: string | string[]) => void;
}) {
  const id = `q-${q.id}`;
  const hintId = q.hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  const text = (k: string) => (typeof values[k] === "string" ? (values[k] as string) : "");

  const label = (
    <span className="text-[15px] font-medium leading-[1.45] text-[#F4F1EA]">
      {q.label}
      {q.required && <span className="text-[#E8B644]"> *</span>}
    </span>
  );
  const hint = q.hint && (
    <span id={hintId} className="text-[13px] leading-[1.5] text-[#8A8579]">
      {q.hint}
    </span>
  );
  const err = error && (
    <span id={errId} role="alert" className="text-[13px] text-[#FF9C9C]">
      {error}
    </span>
  );

  if (q.type === "multi" || q.type === "single") {
    const picked = q.type === "multi" ? ((values[q.id] as string[]) ?? []) : text(q.id);
    return (
      <fieldset id={id} className="grid gap-2.5" aria-describedby={describedBy}>
        <legend className="mb-1 grid gap-1">
          {label}
          {hint}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options!.map((o) => {
            const checked = q.type === "multi" ? (picked as string[]).includes(o) : picked === o;
            return (
              <label
                key={o}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[14.5px] transition-colors ${
                  checked ? "border-[#E8B644]/60 bg-[#1E1809]" : "border-[#F4F1EA]/[0.12] bg-[#141418] hover:border-[#F4F1EA]/25"
                }`}
              >
                <input
                  type={q.type === "multi" ? "checkbox" : "radio"}
                  name={q.id}
                  checked={checked}
                  onChange={() => {
                    if (q.type === "multi") {
                      const list = picked as string[];
                      set(q.id, checked ? list.filter((x) => x !== o) : [...list, o]);
                    } else set(q.id, o);
                  }}
                  className="h-4 w-4 accent-[#E8B644]"
                />
                <span>{o}</span>
              </label>
            );
          })}
        </div>
        {q.other && (
          <input
            type="text"
            aria-label={`${q.label} (other)`}
            placeholder="Other (optional)"
            value={text(otherKey(q.id))}
            onChange={(e) => set(otherKey(q.id), e.target.value)}
            maxLength={500}
            className={field}
          />
        )}
        {err}
      </fieldset>
    );
  }

  return (
    <label className="grid gap-1.5">
      {label}
      {hint}
      {q.type === "textarea" ? (
        <textarea
          id={id}
          rows={q.rows ?? 3}
          value={text(q.id)}
          onChange={(e) => set(q.id, e.target.value)}
          maxLength={8000}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          className={`${field} resize-y leading-[1.55]`}
        />
      ) : (
        <input
          id={id}
          type={q.type === "email" ? "email" : "text"}
          disabled={q.disabled}
          placeholder={q.placeholder}
          value={q.disabled ? "" : text(q.id)}
          onChange={(e) => set(q.id, e.target.value)}
          maxLength={500}
          required={q.required}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          autoComplete={q.type === "email" ? "email" : q.id === "name" ? "name" : "off"}
          className={field}
        />
      )}
      {err}
    </label>
  );
}
