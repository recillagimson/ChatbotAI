// tests/flow-state.spec.ts - pure surface of lib/flow-state.ts. No network, no DB.
// Committed (scripts/ is gitignored, so a shipping module's tests belong here).
//
// The feature flag is process.env-driven and read at call time, so the render tests
// set/restore it around themselves rather than relying on the ambient environment.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseFlowState,
  serializeFlowState,
  normalizeFlowState,
  buildFlowPrompt,
  extractLastQuestion,
  countRecentAsks,
  countStaleTurns,
  ledgerCorroboratesUnanswered,
  renderFlowStateBlock,
  FLOW_STATE_MAX_CHARS,
  FLOW_STATE_MAX_STALE_TURNS,
  FLOW_STATE_MAX_ITEMS,
  FLOW_STATE_MAX_QUESTION,
  type FlowItem,
} from "@/lib/flow-state";

const BOT = "11111111-2222-3333-4444-555555555555";
const OTHER_BOT = "99999999-8888-7777-6666-555555555555";

function item(over: Partial<FlowItem> = {}): FlowItem {
  return { status: "open", asks: 1, label: "what-they-need", answer: "", ...over };
}

describe("parseFlowState / serializeFlowState", () => {
  it("round-trips a real ledger", () => {
    const stored = [
      "answered|1|what-they-need-help-with|late payments and a collection",
      "answered|2|who-ran-the-report|a company ran it",
      "open|3|what-changed-recently|",
    ].join("\n");
    const items = parseFlowState(stored);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      status: "answered",
      asks: 1,
      label: "what-they-need-help-with",
      answer: "late payments and a collection",
    });
    expect(items[2].status).toBe("open");
    expect(serializeFlowState(items)).toBe(stored);
  });

  it("returns nothing for blank input and the (none) sentinel", () => {
    expect(parseFlowState(null)).toEqual([]);
    expect(parseFlowState("")).toEqual([]);
    expect(parseFlowState("(none)")).toEqual([]);
    expect(parseFlowState("None.")).toEqual([]);
  });

  it("drops malformed lines rather than guessing at them", () => {
    const raw = [
      "maybe|1|some-label|x", // bad status
      "answered|1|Bad Label!|x", // bad label chars
      "answered|1|" + "a".repeat(41) + "|x", // label over 40 chars
      "answered|1", // missing fields
      "not a ledger line at all",
      "```",
      "open|1|good-label|",
    ].join("\n");
    const items = parseFlowState(raw);
    expect(items.map((i) => i.label)).toEqual(["good-label"]);
  });

  it("clamps asks: non-numeric -> 1, 99 -> 9, 0 -> 1", () => {
    const items = parseFlowState(
      ["open|x|a-label|", "open|99|b-label|", "open|0|c-label|"].join("\n")
    );
    expect(items.map((i) => i.asks)).toEqual([1, 9, 1]);
  });

  it("forces an empty answer on anything not answered", () => {
    const items = parseFlowState(["open|1|a-label|they said something", "refused|2|b-label|nope"].join("\n"));
    expect(items[0].answer).toBe("");
    expect(items[1].answer).toBe("");
  });

  it("normalizes a spaced label and de-dupes by label, last wins", () => {
    const items = parseFlowState(
      ["open|1|what changed|", "answered|3|what-changed|they moved house"].join("\n")
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "answered", asks: 3, answer: "they moved house" });
  });

  it("caps on an ITEM boundary, never mid-line", () => {
    const many: FlowItem[] = [];
    for (let i = 0; i < 30; i++) {
      many.push(
        item({
          status: "answered",
          label: `label-number-${i}`,
          answer: "a fairly long answer snippet here ok",
        })
      );
    }
    const out = serializeFlowState(many);
    const lines = out.split("\n");
    expect(out.length).toBeLessThanOrEqual(FLOW_STATE_MAX_CHARS);
    expect(lines.length).toBeLessThanOrEqual(FLOW_STATE_MAX_ITEMS);
    // The last emitted line must be a WHOLE item, i.e. it must round-trip.
    const last = lines[lines.length - 1];
    expect(parseFlowState(last)).toHaveLength(1);
    expect(serializeFlowState(parseFlowState(out))).toBe(out);
  });

  it("drops an over-long single line instead of truncating it", () => {
    const out = serializeFlowState([
      item({ status: "answered", label: "short-one", answer: "fine" }),
      item({ status: "answered", label: "long-one", answer: "x".repeat(300) }),
    ]);
    expect(out).toBe("answered|1|short-one|fine");
  });
});

describe("normalizeFlowState", () => {
  it("is three-valued: (none) -> empty ledger, garbage -> failure", () => {
    expect(normalizeFlowState("(none)")).toBe("");
    expect(normalizeFlowState("  none. ")).toBe("");
    expect(normalizeFlowState("Sure! Here is the updated ledger for you.")).toBeNull();
    expect(normalizeFlowState("")).toBeNull();
    expect(normalizeFlowState(null)).toBeNull();
    expect(normalizeFlowState("open|1|a-label|")).toBe("open|1|a-label|");
  });

  it("never conflates null (failure) with '' (nothing asked)", () => {
    expect(normalizeFlowState("(none)")).not.toBeNull();
    expect(normalizeFlowState("total garbage prose")).not.toBe("");
  });
});

describe("extractLastQuestion", () => {
  it("returns the last question sentence of the newest bubble that has one", () => {
    const text = "got it, that happens a lot\n\nso what made you finally decide to deal with this now?";
    expect(extractLastQuestion(text)).toBe("so what made you finally decide to deal with this now?");
  });

  it("finds a question in a non-final bubble", () => {
    const text = "have you tried anything before?\n\nno rush either way";
    expect(extractLastQuestion(text)).toBe("have you tried anything before?");
  });

  it("quotes only the question, not the sentence before it", () => {
    const text = "ok that makes sense. who ran that report for you?";
    expect(extractLastQuestion(text)).toBe("who ran that report for you?");
  });

  it("returns null when nothing was asked", () => {
    expect(extractLastQuestion("all good, talk soon")).toBeNull();
    expect(extractLastQuestion("")).toBeNull();
  });

  it("caps a very long question", () => {
    const q = `${"why ".repeat(80)}?`;
    const out = extractLastQuestion(q);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(FLOW_STATE_MAX_QUESTION);
  });
});

describe("countRecentAsks", () => {
  const q = "so what made you finally decide to deal with this now?";

  it("counts a verbatim repeat across all three recent messages", () => {
    expect(countRecentAsks([q, q, q], q)).toBe(3);
  });

  it("counts a rephrasing that is still the same question", () => {
    const reworded = "so what made you decide to finally deal with this now?";
    expect(countRecentAsks([q, reworded], q)).toBe(2);
  });

  it("does not count an unrelated question", () => {
    expect(countRecentAsks([q, "have you tried anything before?"], q)).toBe(1);
  });

  it("looks at most three messages back and handles empties", () => {
    expect(countRecentAsks([q, q, q, q], q)).toBe(3);
    expect(countRecentAsks([], q)).toBe(0);
    expect(countRecentAsks([q], "")).toBe(0);
  });
});

describe("renderFlowStateBlock", () => {
  const prevEnabled = process.env.FLOW_STATE_ENABLED;
  const prevIds = process.env.FLOW_STATE_CHATBOT_IDS;
  const stored = [
    "answered|1|what-they-need-help-with|late payments and a collection",
    "answered|2|who-ran-the-report|a company ran it",
    "answered|1|what-they-already-tried|paid someone before, came back verified",
    "open|3|what-changed-recently|",
  ].join("\n");
  const question = "so what made you finally decide to deal with this now?";

  beforeEach(() => {
    process.env.FLOW_STATE_ENABLED = "true";
    delete process.env.FLOW_STATE_CHATBOT_IDS;
  });
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.FLOW_STATE_ENABLED;
    else process.env.FLOW_STATE_ENABLED = prevEnabled;
    if (prevIds === undefined) delete process.env.FLOW_STATE_CHATBOT_IDS;
    else process.env.FLOW_STATE_CHATBOT_IDS = prevIds;
  });

  it("is empty when the flag is off", () => {
    delete process.env.FLOW_STATE_ENABLED;
    expect(
      renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 1, lastQuestion: question, askCount: 3 })
    ).toBe("");
  });

  it("is empty for a chatbot outside the allowlist", () => {
    process.env.FLOW_STATE_CHATBOT_IDS = `${OTHER_BOT}, ${OTHER_BOT}`;
    expect(
      renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 1, lastQuestion: question, askCount: 3 })
    ).toBe("");
    process.env.FLOW_STATE_CHATBOT_IDS = ` ${BOT} , ${OTHER_BOT}`;
    expect(
      renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 1, lastQuestion: question, askCount: 3 })
    ).not.toBe("");
  });

  it("is empty with no ledger and no question (byte-identical prompt to today)", () => {
    expect(
      renderFlowStateBlock({ chatbotId: BOT, stored: null, staleTurns: 0, lastQuestion: null, askCount: 0 })
    ).toBe("");
  });

  it("renders both layers with the graduated ladder at 3", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored,
      staleTurns: 1,
      lastQuestion: question,
      askCount: 3,
    });
    expect(block).toContain("It is current as of 1 message ago");
    expect(block).toContain("the conversation wins");
    expect(block).toContain("ALREADY ANSWERED (do not ask again):");
    expect(block).toContain('- what they need help with: "late payments and a collection"');
    expect(block).toContain("ASKED AND NOT ANSWERED - STOP ASKING THESE.");
    expect(block).toContain("- what changed recently (asked 3x)");
    expect(block).not.toContain("STILL OPEN");
    expect(block).toContain(`LAST QUESTION YOU ACTUALLY SENT, WORD FOR WORD: "${question}"`);
    expect(block).toContain("YOU HAVE SENT THAT SAME QUESTION IN YOUR LAST 3 MESSAGES");
    expect(block).not.toContain("second outing");
  });

  it("states its own age deterministically", () => {
    const at0 = renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 0, lastQuestion: null, askCount: 0 });
    expect(at0).toContain("It is current as of this turn.");
    const at3 = renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 3, lastQuestion: null, askCount: 0 });
    expect(at3).toContain("It is current as of 3 messages ago");
  });

  it("drops Layer B entirely once the ledger is too far behind, keeping Layer A", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored,
      staleTurns: 9,
      lastQuestion: question,
      askCount: 1,
    });
    expect(block).not.toContain("ALREADY ANSWERED");
    expect(block).not.toContain("STILL OPEN");
    expect(block).toContain("LAST QUESTION YOU ACTUALLY SENT");
    // ...and with no question either, nothing at all is injected.
    expect(
      renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 9, lastQuestion: null, askCount: 0 })
    ).toBe("");
  });

  it("gives each ladder rung its own final line and only its own", () => {
    const one = renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 0, lastQuestion: question, askCount: 1 });
    expect(one).toContain("If their newest message answers that, even indirectly");
    expect(one).not.toContain("second outing");
    expect(one).not.toContain("IN YOUR LAST 3 MESSAGES");

    const two = renderFlowStateBlock({ chatbotId: BOT, stored, staleTurns: 0, lastQuestion: question, askCount: 2 });
    expect(two).toContain("do not send it a third time in any wording");
    expect(two).not.toContain("IN YOUR LAST 3 MESSAGES");
    // The second rung used to offer "ask it once in a genuinely different way". A
    // replay took one question to nine asks through exactly that door, so both rungs
    // now end the question rather than licensing another attempt.
    expect(two).not.toContain("genuinely different way");
  });

  it("moves an open item to STOP ASKING once it has been asked twice", () => {
    const args = { chatbotId: BOT, staleTurns: 0, lastQuestion: null, askCount: 0 };
    const once = renderFlowStateBlock({ ...args, stored: "open|1|their-timeline|" });
    expect(once).toContain("STILL OPEN (you asked once, no answer yet):");
    expect(once).toContain("- their timeline");
    expect(once).not.toContain("STOP ASKING");

    // Two asks with no answer is the whole failure this section exists for: the item
    // stops being advertised as unfinished business and is named as finished instead.
    const twice = renderFlowStateBlock({ ...args, stored: "open|2|their-timeline|" });
    expect(twice).not.toContain("STILL OPEN");
    expect(twice).toContain("ASKED AND NOT ANSWERED - STOP ASKING THESE.");
    expect(twice).toContain("take the conversation forward without them");
    expect(twice).toContain("- their timeline (asked 2x)");

    // A one-ask item alongside a stalled one still shows in its own section.
    const both = renderFlowStateBlock({
      ...args,
      stored: "open|1|their-timeline|\nopen|4|their-reason|",
    });
    expect(both).toContain("STILL OPEN (you asked once, no answer yet):");
    expect(both).toContain("- their timeline");
    expect(both).toContain("- their reason (asked 4x)");
  });

  it("renders refused items as something to let go of", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored: "refused|2|their-budget|",
      staleTurns: 0,
      lastQuestion: null,
      askCount: 0,
    });
    expect(block).toContain("ASKED AND NOT ANSWERED - STOP ASKING THESE.");
    expect(block).toContain("- their budget");
  });

  it("carries no client vocabulary in any fixed string (multi-tenant)", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored: "open|1|a-label|",
      staleTurns: 0,
      lastQuestion: null,
      askCount: 0,
    }).toLowerCase();
    for (const word of ["credit", "score", "funding", "repair", "instagram", "63"]) {
      expect(block).not.toContain(word);
    }
  });
});

describe("buildFlowPrompt", () => {
  it("carries the prior ledger and the transcript, speaker-labelled", () => {
    const { system, user } = buildFlowPrompt("open|1|a-label|", [
      { role: "assistant", content: "who ran that report?" },
      { role: "user", content: "a company did" },
      { role: "human_agent", content: "hey, jumping in here" },
    ]);
    expect(user).toContain("Existing ledger:\nopen|1|a-label|");
    expect(user).toContain("Business: who ran that report?");
    expect(user).toContain("Lead: a company did");
    expect(user).toContain("Business (human agent): hey, jumping in here");
    expect(system).toContain("QUESTION LEDGER");
  });

  it("uses the (none) sentinel when there is no prior ledger", () => {
    const { user } = buildFlowPrompt(null, [{ role: "user", content: "hi" }]);
    expect(user).toContain("Existing ledger:\n(none)");
  });

  it("is domain-neutral (multi-tenant)", () => {
    const { system } = buildFlowPrompt(null, []);
    const lower = system.toLowerCase();
    for (const word of ["credit", "score", "funding", "repair", "63"]) {
      expect(lower).not.toContain(word);
    }
  });
});

describe("countStaleTurns", () => {
  // Regression: outbound asset rows are inserted AFTER the assistant text row, so
  // they are always newer than flow_state_at. Counting them let ONE numbered proof
  // set (MAX_AI_ASSETS, default 6) plus the lead's next message push staleTurns to 7,
  // past FLOW_STATE_MAX_STALE_TURNS (6) - so renderFlowStateBlock dropped the ledger
  // on the exact media-heavy bots the feature was built for.
  const at = "2026-08-19T12:00:00.000Z";
  const row = (
    role: "user" | "assistant" | "human_agent",
    created_at: string,
    media_url: string | null = null
  ) => ({ role, created_at, media_url });

  it("does not let a media-heavy turn inflate the age", () => {
    const rows = [
      row("assistant", "2026-08-19T12:00:01.000Z"),
      ...Array.from({ length: 6 }, (_, i) =>
        row("assistant", `2026-08-19T12:00:0${2 + i}.000Z`, `assets/proof-${i}.jpg`)
      ),
      row("user", "2026-08-19T12:00:09.000Z"),
    ];
    expect(countStaleTurns(rows, at)).toBe(2);
    expect(countStaleTurns(rows, at)).toBeLessThanOrEqual(FLOW_STATE_MAX_STALE_TURNS);
  });

  it("still counts the lead's own media rows - they carry what the lead said", () => {
    const rows = [row("user", "2026-08-19T12:00:01.000Z", "uploads/screenshot.png")];
    expect(countStaleTurns(rows, at)).toBe(1);
  });

  it("counts nothing older than the stamp, and nothing at all with no stamp", () => {
    const rows = [row("user", "2026-08-19T11:59:59.000Z"), row("assistant", at)];
    expect(countStaleTurns(rows, at)).toBe(0);
    expect(countStaleTurns([row("user", "2026-08-19T12:00:05.000Z")], null)).toBe(0);
  });
});

describe("ledgerCorroboratesUnanswered", () => {
  // Regression: countRecentAsks proves a REPEAT, not a non-answer. A bot that closes
  // every message on a recurring confirm ("Sound good?") scores the full window even
  // when the lead answered each one, so the "STILL HAVE NO ANSWER" half of the copy
  // was a false statement injected at high authority.
  it("agrees only when the ledger has an open item asked at least that often", () => {
    const open3 = [item({ status: "open", asks: 3, label: "what-changed" })];
    expect(ledgerCorroboratesUnanswered(open3, 3)).toBe(true);
    expect(ledgerCorroboratesUnanswered(open3, 2)).toBe(true);
    expect(ledgerCorroboratesUnanswered([item({ status: "open", asks: 1 })], 3)).toBe(false);
    expect(
      ledgerCorroboratesUnanswered([item({ status: "answered", asks: 5, answer: "yes" })], 3)
    ).toBe(false);
    expect(ledgerCorroboratesUnanswered([], 3)).toBe(false);
  });
});

describe("escalation wording only claims what is established", () => {
  const prevEnabled = process.env.FLOW_STATE_ENABLED;
  const question = "sound good?";
  beforeEach(() => {
    process.env.FLOW_STATE_ENABLED = "true";
    delete process.env.FLOW_STATE_CHATBOT_IDS;
  });
  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.FLOW_STATE_ENABLED;
    else process.env.FLOW_STATE_ENABLED = prevEnabled;
  });

  it("drops the 'unanswered' claim when the ledger shows the lead answering", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored: "answered|3|the-confirm|yes lets go",
      staleTurns: 0,
      lastQuestion: question,
      askCount: 3,
    });
    // The repeat itself is a string comparison, so it is still asserted...
    expect(block).toContain("YOU HAVE SENT THAT SAME QUESTION IN YOUR LAST 3 MESSAGES");
    expect(block).toContain("Do not send it again in any wording");
    // ...but nothing claims they never answered.
    expect(block).not.toContain("UNANSWERED");
    expect(block).not.toContain("STILL HAVE NO ANSWER");
  });

  it("makes the claim when the ledger corroborates it", () => {
    const block = renderFlowStateBlock({
      chatbotId: BOT,
      stored: "open|3|the-confirm|",
      staleTurns: 0,
      lastQuestion: question,
      askCount: 3,
    });
    expect(block).toContain("STILL SHOWS IT UNANSWERED");
  });

  it("drops it at rung 2 as well, and when there is no ledger to corroborate with", () => {
    const answered = renderFlowStateBlock({
      chatbotId: BOT,
      stored: "answered|2|the-confirm|yep",
      staleTurns: 0,
      lastQuestion: question,
      askCount: 2,
    });
    expect(answered).toContain("You asked that in your previous message too.");
    expect(answered).not.toContain("still shows it unanswered");

    // Layer A alone (no ledger, or one too stale to render) corroborates nothing.
    const layerAOnly = renderFlowStateBlock({
      chatbotId: BOT,
      stored: null,
      staleTurns: 0,
      lastQuestion: question,
      askCount: 3,
    });
    expect(layerAOnly).toContain("IN YOUR LAST 3 MESSAGES");
    expect(layerAOnly).not.toContain("UNANSWERED");
  });
});

describe("mergeNearDuplicates (via parseFlowState)", () => {
  it("collapses a label that grew a word between turns", () => {
    const items = parseFlowState(
      [
        "answered|1|tried-fixing|Yes",
        "open|2|tried-fixing-before|",
        "answered|1|the-price|63 a month",
      ].join("\n")
    );
    expect(items.map((i) => i.label)).toEqual(["tried-fixing", "the-price"]);
    // answered beats open, and the re-ask still counts toward escalation
    expect(items[0].status).toBe("answered");
    expect(items[0].asks).toBe(3);
  });

  it("does NOT collapse two unrelated labels for the same question", () => {
    // Documents the limit: this is a string comparison, so a question relabelled with
    // entirely different words survives as two lines. Only the extractor prompt
    // prevents that pair; measured dice for it is 0.26.
    const items = parseFlowState(
      ["answered|1|previous-fixes|Yes", "open|2|tried-fixing-before|"].join("\n")
    );
    expect(items).toHaveLength(2);
  });

  it("keeps genuinely different short labels apart", () => {
    const items = parseFlowState(
      ["answered|1|the-price|63", "open|1|the-portal|"].join("\n")
    );
    expect(items).toHaveLength(2);
  });

  it("takes the answer from the answered twin when the first is open", () => {
    const items = parseFlowState(
      ["open|1|what-came-off|", "answered|1|what-came-off-yet|nothing"].join("\n")
    );
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("answered");
    expect(items[0].answer).toBe("nothing");
  });
});
