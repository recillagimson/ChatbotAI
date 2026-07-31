"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthHeading } from "@/components/auth/auth-shell";
import {
  AuthField,
  AuthNotice,
  AuthSubmit,
} from "@/components/auth/auth-field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // The recovery email links back through our PKCE callback, which exchanges
    // the code for a session and forwards to /reset-password.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell cta={{ href: "/login", label: "Sign in" }}>
      <AuthHeading title="Reset your password">
        Enter your email and we&apos;ll send you a link to set a new one.
      </AuthHeading>

      {sent ? (
        <div className="mt-6 flex flex-col gap-4">
          <AuthNotice tone="neutral">
            If an account exists for{" "}
            <span className="font-semibold text-white">{email}</span>, a
            password-reset link is on its way. Check your inbox, and your spam
            folder.
          </AuthNotice>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#c084fc] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
          <AuthField
            id="email"
            label="Email"
            icon={Mail}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />

          {error && <AuthNotice tone="error">{error}</AuthNotice>}

          <AuthSubmit loading={loading} loadingLabel="Sending…" className="mt-1">
            Send reset link
          </AuthSubmit>
        </form>
      )}
    </AuthShell>
  );
}
