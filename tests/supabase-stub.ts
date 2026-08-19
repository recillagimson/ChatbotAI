// tests/supabase-stub.ts - a tiny recording stand-in for the supabase-js query
// builder, enough for the background extractors (lib/lead-facts.ts,
// lib/flow-state.ts) which only ever select a message window, read one conversation
// row, and write one conversation row. No network, no DB.
//
// It exists because the bug it pins is IN the query, not in a pure helper: a message
// window that filters out the lead's own photo / voice note / document rows silently
// deletes the evidence layer those modules are written to read, and nothing in a pure
// unit test can see that.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StubRow {
  role: string;
  content: string;
  created_at: string;
  media_url?: string | null;
}

export interface StubCall {
  table: string;
  method: string;
  args: unknown[];
}

export interface SupabaseStub {
  client: SupabaseClient;
  calls: StubCall[];
  /** Every filter applied to a `messages` query, as "method(arg,arg)". */
  messageFilters: string[];
}

/**
 * Apply the handful of PostgREST filter forms these modules use. Anything else
 * (eq on the conversation id, order, select, returns) is a no-op here; `limit`
 * slices, since a window size is part of what the callers rely on.
 */
function applyFilters(rows: StubRow[], filters: string[]): StubRow[] {
  let out = rows.slice();
  for (const f of filters) {
    if (f === "is(media_url,null)") out = out.filter((r) => !r.media_url);
    else if (f === "or(media_url.is.null,role.eq.user)") {
      out = out.filter((r) => !r.media_url || r.role === "user");
    } else if (f.startsWith("limit(")) {
      const n = Number(f.slice(6, -1));
      if (Number.isFinite(n)) out = out.slice(0, n);
    }
  }
  return out;
}

/**
 * @param rows    what a `messages` select resolves to
 * @param convRow what a `conversations` single() resolves to
 */
export function makeSupabaseStub(rows: StubRow[], convRow: Record<string, unknown>): SupabaseStub {
  const calls: StubCall[] = [];
  const messageFilters: string[] = [];

  const from = (table: string) => {
    let isUpdate = false;
    const builder: Record<string, unknown> = {};
    const record = (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        // String(), not join(): Array#join renders null as an EMPTY string, which would
        // have recorded `.is("media_url", null)` as "is(media_url,)" and made every
        // assertion about that filter match nothing at all.
        if (table === "messages") {
          messageFilters.push(`${method}(${args.map((a) => String(a)).join(",")})`);
        }
        if (method === "update") isUpdate = true;
        return builder;
      };
    for (const m of ["select", "update", "eq", "is", "or", "order", "limit", "returns", "in"]) {
      builder[m] = record(m);
    }
    builder.single = record("single");
    builder.maybeSingle = record("maybeSingle");
    // Thenable: awaiting any point in the chain yields a PostgREST-shaped result.
    // A `messages` select actually APPLIES the row filters it recognises, so a test
    // asserting on the extracted transcript fails for real when the window is wrong -
    // rather than passing because the stub handed back everything regardless.
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (isUpdate) return resolve({ data: [{ id: "row-id" }], error: null });
      if (table === "messages") return resolve({ data: applyFilters(rows, messageFilters), error: null });
      return resolve({ data: convRow, error: null });
    };
    return builder;
  };

  return { client: { from } as unknown as SupabaseClient, calls, messageFilters };
}
