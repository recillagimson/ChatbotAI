"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthTop, AuthHeading } from "@/components/auth/auth-shell";
import {
  AuthField,
  AuthNotice,
  AuthSubmit,
} from "@/components/auth/auth-field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);

  // Read one-time status flags the /auth/callback redirect leaves in the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVerified(params.get("verified") === "1");
    setLinkFailed(params.get("error") === "auth_failed");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      variant="proof"
      top={<AuthTop prompt="New here?" href="/signup" cta="Create an account" />}
    >
      <AuthHeading title="Welcome back">
        Sign in to see what your bot handled while you were away.
      </AuthHeading>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
        {verified && (
          <AuthNotice tone="success">
            Your email is verified. You can sign in now.
          </AuthNotice>
        )}
        {linkFailed && !verified && (
          <AuthNotice tone="info">
            That confirmation link didn&apos;t work or has expired. If your email
            is already verified, just sign in below, otherwise request a new
            link.
          </AuthNotice>
        )}

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

        <AuthField
          id="password"
          label="Password"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          action={
            <Link
              href="/forgot-password"
              className="text-xs font-semibold leading-none text-ss-indigo-600 transition-colors hover:text-ss-indigo-800"
            >
              Forgot?
            </Link>
          }
        />

        {error && <AuthNotice tone="error">{error}</AuthNotice>}

        <AuthSubmit loading={loading} loadingLabel="Signing in…" className="mt-1">
          Sign in
        </AuthSubmit>
      </form>
    </AuthShell>
  );
}
