import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/analytics";
import { getWorkspace } from "@/lib/workspace";
import { loadStageMembers, isStageKey } from "@/lib/analytics-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The contacts inside one funnel stage, as JSON.
 *
 * The Statistics funnel loads this client-side when a stage is expanded (and
 * preloads every stage after the page settles), so drilling into a stage no
 * longer re-runs the whole statistics report on the server. Same range/scope
 * resolution as the page (resolveRange + getWorkspace scope), same members as
 * the old server-side drill-down. Auth + tenancy via the session client.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const stage = url.searchParams.get("stage");
  if (!isStageKey(stage)) {
    return NextResponse.json({ error: "unknown stage" }, { status: 400 });
  }
  // Same clamp as the old page: 1..100, default one page of 8.
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("n")) || 8),
  );

  const { from, to } = resolveRange({
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });

  const supabase = await createClient();
  const workspace = await getWorkspace(url.searchParams.get("bot") ?? null);
  const chatbotId = workspace?.scopedBotId ?? null;

  try {
    const rows = await loadStageMembers(supabase, {
      stage,
      userId: user.id,
      from,
      to,
      chatbotId,
      limit,
    });
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("[statistics/stage] failed", err);
    return NextResponse.json(
      { error: "Couldn't load stage." },
      { status: 500 },
    );
  }
}
