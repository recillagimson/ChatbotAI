"use client";

import { useEffect, useState } from "react";

export type ManychatFlow = { ns: string; name: string };
export type ManychatFlowsResult = { flows: ManychatFlow[]; error: string | null };
export const FLOWS_FALLBACK_ERROR = "Couldn't load your ManyChat flows.";

// One in-flight request per chatbot. The Follow-ups tab mounts WelcomeForm,
// LinkFlowForm and FollowupSequenceForm in the same commit and all three need
// the same list. Each used to fire its own GET, so every tab open cost three
// auth checks and three calls to api.manychat.com (Vercel syd1 to AWS
// eu-central-1). Now they share one.
//
// Nothing is kept after the request settles, so there is no staleness: a later
// mount, a reconnected key or a reload always asks the server again. This is
// request DEDUP, not a cache.
//
// BROWSER ONLY. Next also evaluates "use client" modules on the server during
// SSR, and there a module-level Map would be shared by every tenant's requests
// in the same Node process. The hook only calls this from useEffect, which
// never runs on the server, but loadManychatFlows is exported, so it refuses
// to share anything outside the browser rather than rely on that.
const inflight = new Map<string, Promise<ManychatFlowsResult>>();

function fetchFlows(chatbotId: string): Promise<ManychatFlowsResult> {
  return fetch(`/api/chatbots/${encodeURIComponent(chatbotId)}/manychat-flows`, {
    cache: "no-store",
  })
    .then(async (r) => {
      const j = await r.json().catch(() => null);
      if (r.ok && Array.isArray(j?.flows)) {
        return { flows: j.flows as ManychatFlow[], error: null };
      }
      return {
        flows: [],
        error: typeof j?.error === "string" ? j.error : FLOWS_FALLBACK_ERROR,
      };
    })
    .catch(() => ({ flows: [], error: FLOWS_FALLBACK_ERROR }));
}

export function loadManychatFlows(chatbotId: string): Promise<ManychatFlowsResult> {
  if (typeof window === "undefined") return fetchFlows(chatbotId);

  const pending = inflight.get(chatbotId);
  if (pending) return pending;

  const p = fetchFlows(chatbotId).finally(() => {
    inflight.delete(chatbotId);
  });
  inflight.set(chatbotId, p);
  return p;
}

/**
 * The ManyChat flows for one chatbot. `flows` is null while loading and [] when
 * there are none or the load failed (with `flowsError` set on failure) - the
 * same contract the three forms held inline.
 */
export function useManychatFlows(chatbotId: string): {
  flows: ManychatFlow[] | null;
  flowsError: string | null;
} {
  const [state, setState] = useState<{
    flows: ManychatFlow[] | null;
    flowsError: string | null;
  }>({ flows: null, flowsError: null });

  useEffect(() => {
    let alive = true;
    loadManychatFlows(chatbotId).then((r) => {
      if (alive) setState({ flows: r.flows, flowsError: r.error });
    });
    return () => {
      alive = false;
    };
  }, [chatbotId]);

  return state;
}
