"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { MailCheck } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Deterministic duplicate check first (server-side; reads the profiles
    // source of truth). The signUp() heuristics below are only a backstop —
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
      // Check failed (network/transient) — fall through; signUp still backstops.
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
    // A session means email confirmation is off — the user is signed in now.
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
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>One last step to activate your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4 py-2">
            <MailCheck className="h-12 w-12 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">{email}</span>. Click
              it to activate your account, then log in. If you don&apos;t see it,
              check your spam folder.
            </p>
            <Button asChild className="w-full">
              <Link href="/login">Go to login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Start automating your DMs in under 10 minutes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <p className="text-sm text-center mt-6 text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
