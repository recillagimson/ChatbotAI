import { describe, it, expect } from "vitest";
import { detectHandoff, renderHandoffBlock } from "@/lib/handoff-detect";

describe("detectHandoff - explicit human request", () => {
  it("fires on English requests to reach a person", () => {
    for (const msg of [
      "can I talk to a real person?",
      "I'd like to speak to someone please",
      "is there a real human I can talk to",
      "just connect me with someone",
      "I want a human",
      "can I get a human agent",
      "put me through to a live agent",
    ]) {
      const r = detectHandoff(msg);
      expect(r.handoff, msg).toBe(true);
      expect(r.reason, msg).toBe("human_request");
    }
  });

  it("fires on Spanish requests", () => {
    for (const msg of [
      "quiero hablar con una persona real",
      "puedo hablar con alguien",
      "necesito atencion al cliente",
      "hablar con un humano por favor",
    ]) {
      const r = detectHandoff(msg);
      expect(r.handoff, msg).toBe(true);
      expect(r.reason, msg).toBe("human_request");
    }
  });

  it("matches accented Spanish via the diacritic fold", () => {
    const r = detectHandoff("quiero hablar con alguien, atención al cliente");
    expect(r.handoff).toBe(true);
    expect(r.reason).toBe("human_request");
  });
});

describe("detectHandoff - distress", () => {
  it("fires on clear English distress (incl. apostrophes)", () => {
    for (const msg of [
      "honestly this feels hopeless",
      "I can't do this anymore",
      "I'm so overwhelmed by all of this",
      "I'm at my breaking point",
    ]) {
      const r = detectHandoff(msg);
      expect(r.handoff, msg).toBe(true);
      expect(r.reason, msg).toBe("distress");
    }
  });

  it("fires on Spanish distress", () => {
    const r = detectHandoff("ya no puedo mas con esto");
    expect(r.handoff).toBe(true);
    expect(r.reason).toBe("distress");
  });
});

describe("detectHandoff - human_request outranks distress", () => {
  it("reports human_request when both signals appear", () => {
    const r = detectHandoff("this is hopeless, can I please talk to a real person");
    expect(r.handoff).toBe(true);
    expect(r.reason).toBe("human_request");
    expect(r.patterns).toContain("real person");
  });
});

describe("detectHandoff - benign messages never fire", () => {
  it("ignores normal engaged / hesitant / empty inputs", () => {
    const benign: (string | null | undefined)[] = [
      "no thanks",
      "not right now",
      "maybe later",
      "how much does it cost?",
      "I'm not sure yet",
      "can you help me fix my credit?",
      "I talked to my bank yesterday",
      "can someone help me get started?",
      "yes please",
      "",
      null,
      undefined,
    ];
    for (const msg of benign) {
      const r = detectHandoff(msg as string);
      expect(r.handoff, String(msg)).toBe(false);
      expect(r.reason, String(msg)).toBeNull();
    }
  });
});

describe("renderHandoffBlock", () => {
  it("returns empty string when there is no reason", () => {
    expect(renderHandoffBlock(null)).toBe("");
  });

  it("human_request block defers to a person and stops selling", () => {
    const out = renderHandoffBlock("human_request");
    expect(out).toContain("HAND OFF TO A PERSON");
    expect(out).toContain("team member");
    expect(out).toMatch(/do NOT pitch/i);
    expect(out).not.toContain("SHOW CARE");
  });

  it("distress block leads with care and stops selling", () => {
    const out = renderHandoffBlock("distress");
    expect(out).toContain("SHOW CARE");
    expect(out).toMatch(/do NOT pitch/i);
    expect(out).not.toContain("HAND OFF TO A PERSON");
  });
});
