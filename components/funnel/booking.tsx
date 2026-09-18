"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import { AuButton, AuCard, AuEyebrow, AuPill } from "@/components/aurum/primitives";
import { cn } from "@/lib/utils";
import { money, useFunnel } from "./state";

/**
 * The conversion moment.
 *
 * Deliberate ordering: the TIME is chosen before any personal detail is
 * asked. Picking a slot costs nothing and commits something, and a visitor
 * who has claimed 10:30 on Thursday is finishing the form. Opening with
 * "Full name / Email / Phone" asks for payment before showing the product.
 *
 * Two steps, not one long column, for the same reason - and the step count is
 * visible so nobody fears a fourth screen appearing.
 *
 * INTEGRATION SEAM: `submit()` below is where a real scheduler call belongs
 * (Cal.com / Calendly / a Supabase `bookings` insert). It currently resolves
 * locally and renders the confirmed state; nothing is persisted.
 */

type Slot = { iso: string; day: string; date: string; time: string };

/** Next five weekdays, three slots each, generated on the client so the
 *  server render cannot disagree with the visitor's clock. */
function buildSlots(): Slot[] {
  const out: Slot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (out.length < 15) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      for (const [h, m] of [
        [10, 0],
        [13, 30],
        [16, 0],
      ] as const) {
        const d = new Date(cursor);
        d.setHours(h, m, 0, 0);
        out.push({
          iso: d.toISOString(),
          day: d.toLocaleDateString("en-US", { weekday: "short" }),
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          time: d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out.slice(0, 15);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function BookingForm() {
  const { estimate, booked, setBooked } = useFunnel();

  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [slot, setSlot] = React.useState<Slot | null>(null);
  const [step, setStep] = React.useState<1 | 2>(1);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [touched, setTouched] = React.useState<Record<string, boolean>>({});
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => setSlots(buildSlots()), []);

  const errors = {
    name: name.trim().length < 2 ? "Tell us what to call you." : "",
    email: EMAIL.test(email.trim()) ? "" : "That address looks incomplete.",
  };
  const valid = !errors.name && !errors.email;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, email: true });
    if (!valid || !slot) return;
    setSending(true);
    // --- INTEGRATION SEAM ---------------------------------------------
    // Replace with the scheduler call. The estimate rides along so the call
    // opens on the prospect's own numbers instead of a discovery interview.
    // await fetch("/api/bookings", { method: "POST", body: JSON.stringify({
    //   name, email, handle, slot: slot.iso, estimate }) });
    await new Promise((r) => setTimeout(r, 650));
    // ------------------------------------------------------------------
    setSending(false);
    setBooked(true);
  }

  if (booked && slot) {
    return <Confirmed slot={slot} name={name} email={email} />;
  }

  return (
    <AuCard elevation="float" className="overflow-hidden">
      {/* Progress. Two dots, both visible from the start: the honest answer to
          "how long is this" is given before the first field is touched. */}
      <div className="flex items-center gap-3 border-b border-au-line-soft bg-au-canvas px-6 py-4 sm:px-8">
        <StepDot n={1} active={step === 1} done={step > 1} label="Pick a time" />
        <div className="h-px flex-1 bg-au-line" />
        <StepDot n={2} active={step === 2} done={false} label="Who you are" />
      </div>

      <form onSubmit={submit} className="p-6 sm:p-8">
        {step === 1 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <AuEyebrow>Step one</AuEyebrow>
                <h3 className="au-title-3 mt-3 text-au-ink">
                  When suits you?
                </h3>
              </div>
              <AuPill tone="neutral">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                20 minutes
              </AuPill>
            </div>

            <p className="au-callout mt-3 text-au-ink-2">
              Times are shown in your own timezone.
            </p>

            <fieldset className="mt-6">
              <legend className="sr-only">Available times</legend>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {slots.length === 0
                  ? // Skeletons rather than an empty box: the grid's height is
                    // reserved so the page does not jump when slots arrive.
                    Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[68px] animate-pulse rounded-au-field bg-au-canvas-sunk"
                      />
                    ))
                  : slots.map((s) => {
                      const on = slot?.iso === s.iso;
                      return (
                        <button
                          key={s.iso}
                          type="button"
                          onClick={() => setSlot(s)}
                          aria-pressed={on}
                          className={cn(
                            "au-press rounded-au-field border px-3 py-3 text-left",
                            on
                              ? "border-au-gold bg-au-gold-wash shadow-au-1"
                              : "border-au-line bg-au-surface hover:border-au-line-strong hover:bg-au-surface-raised"
                          )}
                        >
                          <span className="au-caption block text-au-ink-3">
                            {s.day} {s.date}
                          </span>
                          <span
                            className={cn(
                              "mt-1 block text-[15px] font-bold",
                              on ? "text-au-gold-ink-sm" : "text-au-ink"
                            )}
                          >
                            {s.time}
                          </span>
                        </button>
                      );
                    })}
              </div>
            </fieldset>

            <AuButton
              type="button"
              size="lg"
              block
              className="mt-7"
              disabled={!slot}
              onClick={() => setStep(2)}
            >
              {slot ? `Hold ${slot.day} at ${slot.time}` : "Pick a time first"}
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </AuButton>
          </>
        ) : (
          <>
            <AuEyebrow>Step two</AuEyebrow>
            <h3 className="au-title-3 mt-3 text-au-ink">
              Two fields and you&rsquo;re booked.
            </h3>

            {slot ? (
              <p className="au-callout mt-3 text-au-ink-2">
                Holding{" "}
                <strong className="font-semibold text-au-ink">
                  {slot.day} {slot.date} at {slot.time}
                </strong>
                .
              </p>
            ) : null}

            <div className="mt-6 space-y-4">
              <Field
                id="bk-name"
                label="Your name"
                value={name}
                onChange={setName}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                error={touched.name ? errors.name : ""}
                autoComplete="name"
              />
              <Field
                id="bk-email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                error={touched.email ? errors.email : ""}
                autoComplete="email"
              />
              <Field
                id="bk-handle"
                label="Instagram handle"
                optional
                value={handle}
                onChange={setHandle}
                hint="So we can look at your actual DMs before the call."
              />
            </div>

            {estimate && estimate.recoveredRevenue > 0 ? (
              <div className="mt-6 rounded-au-field border border-au-gold-line bg-au-gold-tint px-4 py-3.5">
                <p className="au-caption text-au-ink-2">
                  We&rsquo;ll open with your estimate:{" "}
                  <strong className="font-bold text-au-gold-ink-sm">
                    {money(estimate.recoveredRevenue)}/mo
                  </strong>{" "}
                  across{" "}
                  {estimate.recoveredConversations.toLocaleString("en-US")} cold
                  conversations.
                </p>
              </div>
            ) : null}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
              <AuButton
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                Change time
              </AuButton>
              <AuButton type="submit" size="lg" block disabled={sending}>
                {sending ? "Booking…" : "Confirm my call"}
              </AuButton>
            </div>

            <p className="au-caption mt-4 text-center text-au-ink-3">
              No card, no contract. If it&rsquo;s not a fit we&rsquo;ll say so
              on the call.
            </p>
          </>
        )}
      </form>
    </AuCard>
  );
}

function StepDot({
  n,
  active,
  done,
  label,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold transition-colors duration-200 ease-au-out",
          done && "bg-au-good text-white",
          active && !done && "bg-au-gold text-au-ink",
          !active && !done && "bg-au-canvas-sunk text-au-ink-3"
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold",
          active || done ? "text-au-ink" : "text-au-ink-3"
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Validation is shown on blur, never held back until submit. Telling someone
 * about four mistakes at once, after they thought they were finished, is the
 * most reliable way to lose them at the last step.
 */
function Field({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  type = "text",
  optional,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  type?: string;
  optional?: boolean;
  autoComplete?: string;
}) {
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline gap-2 text-[14px] font-semibold text-au-ink"
      >
        {label}
        {optional ? (
          <span className="au-caption font-normal text-au-ink-3">optional</span>
        ) : null}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={cn(
          "mt-2 h-12 w-full rounded-au-field border bg-au-surface px-3.5 text-[15px] text-au-ink placeholder:text-au-ink-4",
          "transition-[border-color,box-shadow] duration-200 ease-au-out",
          error
            ? "border-au-bad"
            : "border-au-line-strong hover:border-au-ink-4 focus:border-au-focus"
        )}
      />
      {error ? (
        <p id={`${id}-err`} className="au-caption mt-1.5 text-au-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="au-caption mt-1.5 text-au-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The confirmed state replaces the form rather than sitting above it. The task
 * is done; leaving the form on screen invites a second booking and asks the
 * visitor to work out which part of the page still applies to them.
 */
function Confirmed({
  slot,
  name,
  email,
}: {
  slot: Slot;
  name: string;
  email: string;
}) {
  return (
    <AuCard elevation="float" className="p-8 text-center sm:p-12">
      <div
        className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-au-good-wash"
        aria-hidden="true"
      >
        <Check className="h-7 w-7 text-au-good" />
      </div>
      <h3 className="au-title-2 mt-6 text-au-ink">
        You&rsquo;re booked, {name.split(" ")[0] || "friend"}.
      </h3>
      <p className="au-body-lg mx-auto mt-4 max-w-[34rem] text-au-ink-2">
        <strong className="font-semibold text-au-ink">
          {slot.day} {slot.date} at {slot.time}
        </strong>
        . The invite and video link are on their way to {email || "your inbox"}.
      </p>
      <div className="mx-auto mt-8 max-w-[30rem] rounded-au-field border border-au-line bg-au-canvas px-5 py-4 text-left">
        <AuEyebrow>Before we speak</AuEyebrow>
        <p className="au-callout mt-3 text-au-ink-2">
          Nothing to prepare. If you can, leave your DMs unanswered for a day
          so we can look at real traffic together rather than a tidy inbox.
        </p>
      </div>
    </AuCard>
  );
}
