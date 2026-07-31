import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Read the chatbot name off a `select("*, chatbots(name)")` join.
 *
 * PostgREST returns an embedded to-one relation as an object, but the generated
 * types widen it to an array, so every call site otherwise needs its own cast.
 * Handles both shapes and returns null when the join wasn't selected.
 */
export function botNameOf(rel: unknown): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel;
  const name = (row as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" && name.trim() ? name : null;
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
