"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm bg-muted px-3 py-3 rounded">
              If an account exists for <b>{email}</b>, a password-reset link is on
              its way. Check your inbox (and spam).
            </p>
            <Link
              href="/login"
              className="text-primary font-medium text-sm inline-block"
            >
              ← Back to login
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@business.com"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </Button>
            </form>
            <p className="text-sm text-center mt-6 text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="text-primary font-medium">
                Back to login
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
