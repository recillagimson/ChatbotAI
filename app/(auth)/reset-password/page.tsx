"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthHeading } from "@/components/auth/auth-shell";
import {
  AuthField,
  AuthNotice,
  AuthSubmit,
} from "@/components/auth/auth-field";
import { MIN_PASSWORD_LENGTH, scorePassword } from "@/lib/password-strength";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = scorePassword(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    // The recovery callback already established a session, so updateUser sets
    // the password for the current (recovered) user.
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(
        /session|jwt|token/i.test(error.message)
          ? "This reset link is invalid or has expired. Please request a new one."
          : error.message
      );
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  return (
    <AuthShell>
      <AuthHeading title="Set a new password">
        Choose a new password for your account.
      </AuthHeading>

      {done ? (
        <div className="mt-6">
          <AuthNotice tone="success">
            Password updated. Taking you to your dashboard…
          </AuthNotice>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
          <AuthField
            id="password"
            label="New password"
            icon={Lock}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={
              password
                ? `${strength.label}. ${strength.advice ?? ""}`.trim()
                : `At least ${MIN_PASSWORD_LENGTH} characters.`
            }
          />

          <AuthField
            id="confirm"
            label="Confirm new password"
            icon={Lock}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && (
            <AuthNotice tone="error">
              <p>{error}</p>
              {/session|invalid|expired/i.test(error) && (
                <Link href="/forgot-password" className="font-semibold underline">
                  Request a new link
                </Link>
              )}
            </AuthNotice>
          )}

          <AuthSubmit loading={loading} loadingLabel="Saving…" className="mt-1">
            Update password
          </AuthSubmit>
        </form>
      )}
    </AuthShell>
  );
}
