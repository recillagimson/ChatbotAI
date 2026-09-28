// lib/trainer-preview.ts
// What the Training sandbox needs to show a reply the way a real lead would get
// it. Two pure decisions, mirroring the live webhook (app/api/webhooks/manychat):
//  - planKeywordForPreview: would a keyword trigger answer this message instead
//    of the AI (a canned reply), steer the AI (an instruction), or would the
//    keyword gate leave it unanswered?
//  - buildPreviewItems: the reply's text bubbles, link flows and media sends, in
//    the order the lead would receive them.
// Server-side (imports lib/manychat for the link-bubble split).

import type { FollowupAsset, KeywordGroup } from "./types";
import type { LinkFlowDelivery } from "./link-flow";
import { resolveAssetByKey } from "./followup-assets";
import { isolateLinkBubbles } from "./manychat";

export type KeywordPreviewPlan =
  | { kind: "none" }
  // questionsMayPass: the bot answers a stranger's genuine business question anyway
  // (keyword_gate_answer_questions, screened live by AI), so "no reply" isn't certain.
  | { kind: "gated"; questionsMayPass: boolean }
  | {
      kind: "canned";
      text: string;
      assetKey: string | null;
      groupId: string;
      keywords: string[];
      repeat: boolean;
      fires: boolean;
    }
  | { kind: "instruction"; instruction: string | null; groupId: string; keywords: string[]; fires: boolean }
  | { kind: "ai"; groupId: string; keywords: string[]; fires: boolean };

/**
 * Mirrors the webhook's keyword steps (gate 6-gate and step 6c):
 *  - no match: gated when the bot answers only after a keyword and this contact
 *    has not used one yet; otherwise a normal AI reply;
 *  - FIRST match for the contact: first_reply_mode - "message" sends the canned
 *    first reply (and fires), unless it has no text, which falls through to the AI
 *    without firing; "instruction" steers the AI; "ai" hands it to the AI;
 *  - LATER matches: on_repeat, the same way (a later match never fires again).
 * `fires` = the group is recorded as used for this contact after this message.
 */
export function planKeywordForPreview(input: {
  group: KeywordGroup | null;
  alreadyFired: boolean;
  gateEnabled: boolean;
  engaged: boolean;
  answersQuestions?: boolean;
}): KeywordPreviewPlan {
  const { group } = input;
  if (!group) {
    return input.gateEnabled && !input.engaged
      ? { kind: "gated", questionsMayPass: !!input.answersQuestions }
      : { kind: "none" };
  }

  const base = { groupId: group.id, keywords: (group.keywords ?? []).slice(0, 5) };
  if (!input.alreadyFired) {
    const mode = group.first_reply_mode ?? "message";
    if (mode === "message") {
      const text = group.first_reply_text?.trim() ?? "";
      if (text) {
        return {
          kind: "canned",
          text,
          assetKey: group.first_reply_asset_key ?? null,
          ...base,
          repeat: false,
          fires: true,
        };
      }
      return { kind: "ai", ...base, fires: false };
    }
    if (mode === "instruction") {
      return { kind: "instruction", instruction: group.first_reply_instruction?.trim() || null, ...base, fires: true };
    }
    return { kind: "ai", ...base, fires: true };
  }

  if (group.on_repeat === "message") {
    const text = group.repeat_text?.trim() ?? "";
    if (text) return { kind: "canned", text, assetKey: null, ...base, repeat: true, fires: false };
    return { kind: "ai", ...base, fires: false };
  }
  if (group.on_repeat === "instruction") {
    return { kind: "instruction", instruction: group.instruction?.trim() || null, ...base, fires: false };
  }
  return { kind: "ai", ...base, fires: false };
}

export type PreviewItem =
  | { kind: "text"; text: string }
  | { kind: "flow"; name: string }
  | { kind: "media"; key: string; found: boolean; label: string | null; mediaKind: string | null };

/**
 * The delivery steps (already split into bubbles by planDeliveryBubbles) as the
 * lead receives them: each text bubble (a link gets its own bubble, as on
 * Instagram), each link flow by name, and each media send - flagged when its key
 * is not in the bot's library, since the live bot would silently skip it.
 */
export function buildPreviewItems(steps: LinkFlowDelivery[], assets: FollowupAsset[]): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const s of steps) {
    if (s.kind === "text") {
      for (const t of isolateLinkBubbles(s.text)) if (t.trim()) out.push({ kind: "text", text: t });
    } else if (s.kind === "flow") {
      out.push({ kind: "flow", name: s.name?.trim() || "Link" });
    } else {
      const a = resolveAssetByKey(assets, s.key);
      out.push({
        kind: "media",
        key: s.key,
        found: !!a?.url,
        label: a?.label ?? null,
        mediaKind: a?.kind ?? null,
      });
    }
  }
  return out;
}
