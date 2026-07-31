"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, Mail, MailCheck, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthTop, AuthHeading } from "@/components/auth/auth-shell";
import {
  AuthCheckbox,
  AuthField,
  AuthNotice,
  AuthSubmit,
} from "@/components/auth/auth-field";
import { MIN_PASSWORD_LENGTH, scorePassword } from "@/lib/password-strength";

/** Enough to light the "looks like an email" tick - not a claim it's verified. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TOTAL_STEPS = 4;

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const strength = scorePassword(password);
  const emailLooksValid = EMAIL_SHAPE.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Cheap client-side guard before any network calls.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setLoading(true);

    // Deterministic duplicate check first (server-side; reads the profiles
    // source of truth). The signUp() heuristics below are only a backstop -
    // they depend on Supabase's email-confirmation settings.
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const { exists } = (await res.json()) as { exists?: boolean };
      if (exists) {
        setError(
          "An account with this email already exists. Try logging in instead."
        );
        setLoading(false);
        return;
      }
    } catch {
      // Check failed (network/transient) - fall through; signUp still backstops.
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) {
      // Covers the email-confirmation-disabled case, where Supabase returns an
      // explicit "User already registered" error.
      setError(error.message);
      setLoading(false);
      return;
    }
    // Already-registered detection: with email confirmation ON, Supabase does
    // NOT error on a duplicate email (anti-enumeration); it returns a user with
    // an empty `identities` array instead. Treat that as "already registered".
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError(
        "An account with this email already exists. Try logging in instead."
      );
      setLoading(false);
      return;
    }
    // A session means email confirmation is off - the user is signed in now.
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }
    // No session: a confirmation email was sent. Tell them to check it.
    setConfirmationSent(true);
    setLoading(false);
  }

  if (confirmationSent) {
    return (
      <AuthShell
        variant="setup"
        top={<AuthTop prompt="Already confirmed?" href="/login" cta="Sign in" />}
      >
        <StepProgress step={2} />
        <div className="mt-4">
          <AuthHeading title="Check your email">
            One last step to activate your account.
          </AuthHeading>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-start gap-3.5 rounded-chip border border-ss-line bg-ss-page-alt px-4 py-4">
            <MailCheck className="h-5 w-5 shrink-0 text-ss-indigo" aria-hidden />
            <p className="text-[13px] leading-[1.6] text-ss-body">
              We sent a confirmation link to{" "}
              <span className="font-semibold text-ss-ink">{email}</span>. Click
              it to activate your account, then sign in. If you don&apos;t see
              it, check your spam folder.
            </p>
          </div>
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-chip bg-ss-indigo p-[15px] text-sm font-bold leading-none text-white shadow-[0_12px_24px_-14px_rgba(99,102,241,.95)] transition-colors hover:bg-ss-indigo-600"
          >
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="setup"
      top={
        <AuthTop prompt="Already have an account?" href="/login" cta="Sign in" />
      }
    >
      <StepProgress step={1} />

      <div className="mt-4">
        <AuthHeading title="Create your account">
          No card needed to set your bot up.
        </AuthHeading>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
        <AuthField
          id="fullName"
          label="Full name"
          icon={User}
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Dela Cruz"
        />

        <AuthField
          id="email"
          label="Work email"
          icon={Mail}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          adornment={
            emailLooksValid ? (
              <CheckCircle2
                className="h-[17px] w-[17px] shrink-0 text-ss-green"
                aria-label="Email address looks valid"
              />
            ) : null
          }
        />

        <AuthField
          id="password"
          label="Password"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          below={password ? <StrengthMeter {...strength} /> : null}
          hint={
            password
              ? strength.advice
              : `At least ${MIN_PASSWORD_LENGTH} characters with a number.`
          }
        />

        <AuthCheckbox id="terms" checked={agreed} onChange={setAgreed} required>
          I agree to the{" "}
          <Link href="/terms" className="font-semibold text-ss-indigo-600 underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="font-semibold text-ss-indigo-600 underline">
            Privacy Policy
          </Link>
          .
        </AuthCheckbox>

        {error && <AuthNotice tone="error">{error}</AuthNotice>}

        <AuthSubmit
          loading={loading}
          loadingLabel="Creating account…"
          className="mt-1"
        >
          Create account
        </AuthSubmit>

        <p className="text-center text-[11.5px] leading-none text-ss-faint">
          Next: confirm your email
        </p>
      </form>
    </AuthShell>
  );
}

/** The bar-and-count progress marker above the heading. */
function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-[7px]">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span
          key={i}
          className={`h-1 w-[26px] rounded-full ${
            i < step ? "bg-ss-indigo" : "bg-ss-rule"
          }`}
        />
      ))}
      <span className="ml-1.5 text-[11px] font-semibold leading-none text-ss-muted">
        Step {step} of {TOTAL_STEPS}
      </span>
    </div>
  );
}

function StrengthMeter({
  score,
  label,
}: {
  score: number;
  label: string;
}) {
  // 1-2 bars amber, 3+ green: the colour should agree with the word beside it.
  const tone = score >= 3 ? "bg-ss-green" : score >= 1 ? "bg-ss-amber" : "bg-ss-rule";
  const text = score >= 3 ? "text-ss-green-ink" : "text-ss-amber-ink";
  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <span className="flex flex-1 gap-[3px]" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < score ? tone : "bg-ss-rule"}`}
          />
        ))}
      </span>
      <span className={`text-[11px] font-semibold leading-none ${text}`}>
        {label}
      </span>
    </div>
  );
}
