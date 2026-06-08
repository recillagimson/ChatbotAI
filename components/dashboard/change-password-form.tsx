"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();

    // Re-authenticate with the current password before allowing a change.
    // Supabase's updateUser doesn't verify the old password on its own.
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (authErr) {
      setLoading(false);
      setError("Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cur-pw">Current password</Label>
        <Input
          id="cur-pw"
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-pw">New password</Label>
        <Input
          id="new-pw"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={next}
          onChange={(e) => {
            setNext(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-pw">Confirm new password</Label>
        <Input
          id="confirm-pw"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setSaved(false);
          }}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
        {saved && <span className="text-sm text-green-600">Password updated ✓</span>}
      </div>
    </form>
  );
}
