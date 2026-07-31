"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Unit = "days" | "months";
type Preset = { label: string; amount: number; unit: Unit };

const PRESETS: Preset[] = [
  { label: "7 days", amount: 7, unit: "days" },
  { label: "30 days", amount: 30, unit: "days" },
  { label: "90 days", amount: 90, unit: "days" },
  { label: "6 months", amount: 6, unit: "months" },
  { label: "12 months", amount: 12, unit: "months" },
];

/**
 * Superadmin control to grant / extend / revoke comp access for one client.
 * Posts to /api/admin/grant-access and refreshes the server component so the
 * Access card re-renders with the new state. Presets fill the amount+unit; the
 * admin confirms with Grant (no one-click accidental grants).
 */
export function GrantAccessForm({
  userId,
  compExpiresAt,
  compNote,
}: {
  userId: string;
  compExpiresAt: string | null; // set + in the future when a comp is active
  compNote: string | null;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(30);
  const [unit, setUnit] = useState<Unit>("days");
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState<null | "grant" | "extend" | "revoke">(null);
  const [error, setError] = useState<string | null>(null);

  const compActive = !!compExpiresAt && new Date(compExpiresAt) > new Date();
  // Cap matches the server contract (route.ts zod): 3650 days / 120 months.
  const maxAmount = unit === "months" ? 120 : 3650;

  async function send(action: "grant" | "extend" | "revoke") {
    setBusy(action);
    setError(null);
    try {
      const body: Record<string, unknown> = { userId, action };
      if (action !== "revoke") {
        body[unit] = amount;
        if (note.trim()) body.note = note.trim();
      }
      const res = await fetch("/api/admin/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(
          data?.error === "has_paid_subscription"
            ? "This client already has an active paid subscription - no comp needed."
            : data?.error || "Something went wrong."
        );
        setBusy(null);
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {compActive && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Comp access active until{" "}
          <span className="font-medium">
            {new Date(compExpiresAt!).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          {compNote ? <> · {compNote}</> : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const selected = amount === p.amount && unit === p.unit;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setAmount(p.amount);
                setUnit(p.unit);
              }}
              className={
                "rounded-full border px-3 py-1 text-sm transition-colors " +
                (selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-muted")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Label htmlFor="grant-amount">Amount</Label>
          <Input
            id="grant-amount"
            type="number"
            min={1}
            max={maxAmount}
            value={amount}
            onChange={(e) =>
              setAmount(Math.min(maxAmount, Math.max(1, Number(e.target.value) || 0)))
            }
          />
        </div>
        <div className="w-36">
          <Label htmlFor="grant-unit">Unit</Label>
          <select
            id="grant-unit"
            value={unit}
            onChange={(e) => {
              const next = e.target.value as Unit;
              setUnit(next);
              // Re-clamp so switching to Months can't leave an over-cap amount.
              setAmount((a) => Math.min(next === "months" ? 120 : 3650, a));
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="days">Days</option>
            <option value="months">Months</option>
          </select>
        </div>
      </div>

      <div>
        <Label htmlFor="grant-note">Note (optional)</Label>
        <Textarea
          id="grant-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for the comp (internal only)"
          rows={2}
          maxLength={500}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => send("grant")} disabled={busy !== null}>
          {busy === "grant" ? "Granting…" : compActive ? "Reset to this duration" : "Grant access"}
        </Button>
        {compActive && (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => send("extend")}
              disabled={busy !== null}
            >
              {busy === "extend" ? "Extending…" : "Extend"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirm("Revoke this client's comp access now?")) send("revoke");
              }}
              disabled={busy !== null}
            >
              {busy === "revoke" ? "Revoking…" : "Revoke"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
