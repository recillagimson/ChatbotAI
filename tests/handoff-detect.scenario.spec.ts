import { describe, it, expect } from "vitest";
import { detectHandoff } from "@/lib/handoff-detect";
import { parseSentAssetKeys, renderSentStateBlock } from "@/lib/sent-state";

// Regression test for the long-thread LOOP scenario (shape of the LGF Pro c6d8f3e2
// incident: a proof asset re-sent several times, then an explicit "talk to a real
// person" ask, then distress). Uses SYNTHETIC messages (no lead PII); asset keys are
// bot-side identifiers, not personal data. Guards Fix B (already-sent state) + Fix E
// (graceful disengage) together against the exact failure pattern.

// A proof asset re-sent 4x among other proofs - the "re-sending items it already sent" loop.
const SENT_ROWS = [
  "(sent image: proof_bankruptcy_1)",
  "(sent image: proof_bankruptcy_2)",
  "(sent image: proof_reviews_1)",
  "(sent image: proof_chargeoffs)",
  "(sent image: proof_inquiries)",
  "(sent image: proof_late_payments_1)",
  "(sent image: proof_reviews_1)",
  "(sent image: proof_reviews_1)",
  "(sent image: proof_reviews_1)",
];

const LEAD_HUMAN_REQ = "not yet, I actually wanna talk to a real person before I make any decisions";
const LEAD_DISTRESS = "honestly this whole thing feels hopeless";

describe("loop scenario - Fix B already-sent state", () => {
  it("dedups a proof re-sent 4x and flags do-not-resend + link-sent", () => {
    const keys = parseSentAssetKeys(SENT_ROWS);
    expect(keys.filter((k) => k === "proof_reviews_1")).toHaveLength(1);
    expect(keys).toContain("proof_bankruptcy_1");
    const block = renderSentStateBlock({ sentAssetKeys: keys, linkAlreadySent: true });
    expect(block).toContain("proof_reviews_1");
    expect(block).toMatch(/do NOT send any of these again/i);
    expect(block).toContain("THE LINK HAS ALREADY BEEN SENT");
  });
});

describe("loop scenario - Fix E graceful disengage", () => {
  it("fires human_request on an explicit 'talk to a real person' ask", () => {
    const r = detectHandoff(LEAD_HUMAN_REQ);
    expect(r.handoff).toBe(true);
    expect(r.reason).toBe("human_request");
    expect(r.patterns).toContain("real person");
  });

  it("fires distress on a 'hopeless' message", () => {
    const r = detectHandoff(LEAD_DISTRESS);
    expect(r.handoff).toBe(true);
    expect(r.reason).toBe("distress");
  });
});
