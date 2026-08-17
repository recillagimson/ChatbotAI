import { NextResponse, type NextRequest } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { readInboxFilters } from "@/lib/inbox-params";
import { loadInbox } from "@/lib/inbox-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The inbox thread list, as JSON.
 *
 * The persistent client list (rendered in the conversations LAYOUT) calls this to
 * refresh on filter / search / paging changes WITHOUT the page reloading - so
 * opening a thread, which changes only the URL path, never re-runs it; only a
 * query-string change does. Same queries the old server `<InboxList>` ran; auth
 * and tenancy come from the session client + RLS, and the effective (possibly
 * impersonated) user via getCurrentUser matches the rest of the dashboard.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const current = readInboxFilters(sp);

  try {
    const data = await loadInbox(supabase, user.id, current);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[conversations/list] failed", err);
    return NextResponse.json(
      { error: "Couldn't load the inbox." },
      { status: 500 },
    );
  }
}
