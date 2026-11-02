import { describe, it, expect } from "vitest";
import {
  extractLeadContacts,
  newLeadContacts,
  formatPhone,
  phoneKey,
  buildSlackLeadAlert,
} from "@/lib/lead-contact";

const phones = (t: string) => extractLeadContacts(t).phones;
const emails = (t: string) => extractLeadContacts(t).emails;

describe("extractLeadContacts: emails", () => {
  it("finds an email anywhere in the message, lowercased", () => {
    expect(emails("sure it's John.Doe@Gmail.com thanks")).toEqual(["john.doe@gmail.com"]);
    expect(emails("email me at a_b+c@mail.co.uk.")).toEqual(["a_b+c@mail.co.uk"]);
  });

  it("finds several and drops repeats", () => {
    expect(emails("x@y.com or z@w.io, x@y.com")).toEqual(["x@y.com", "z@w.io"]);
  });

  it("ignores things that only look close", () => {
    expect(emails("@johnsmith on ig")).toEqual([]);
    expect(emails("meet me @ 5")).toEqual([]);
    expect(emails("john@localhost")).toEqual([]);
  });
});

describe("extractLeadContacts: phones", () => {
  it("finds common US formats", () => {
    for (const t of [
      "call me 5551234567",
      "my number is (555) 123-4567",
      "555-123-4567 anytime",
      "555.123.4567",
      "555 123 4567",
      "+1 555 123 4567",
      "1-555-123-4567",
    ]) {
      expect(phones(t), t).toHaveLength(1);
    }
    expect(phones("+1 (555) 123-4567")).toEqual(["+15551234567"]);
    expect(phones("(555) 123-4567")).toEqual(["5551234567"]);
  });

  it("finds international numbers written with +", () => {
    expect(phones("whatsapp +63 917 123 4567")).toEqual(["+639171234567"]);
    expect(phones("+44 20 7946 0958")).toEqual(["+442079460958"]);
  });

  it("finds an 11-digit local number starting with 0", () => {
    expect(phones("09171234567")).toEqual(["09171234567"]);
  });

  it("does not treat scores, money, dates, years or short numbers as phones", () => {
    for (const t of [
      "my score is 649",
      "scores 649 720 680 700",
      "I make $5,000 a month",
      "I need 1500000 dollars",
      "on 2026-10-30",
      "10/30/2026 works",
      "10.30.2026",
      "since 2019",
      "call 555-1234",
      "zip 14623",
      "card 4242 4242 4242 4242",
    ]) {
      expect(phones(t), t).toEqual([]);
    }
  });

  it("ignores digits inside a link", () => {
    expect(phones("see https://temu.com/s/5551234567 now")).toEqual([]);
    expect(phones("www.site.com/ref/15551234567")).toEqual([]);
  });

  it("drops the same number typed twice", () => {
    expect(phones("5551234567 or +1 555-123-4567")).toHaveLength(1);
  });

  it("finds both a phone and an email in one message", () => {
    expect(extractLeadContacts("jane@x.com / 555-123-4567")).toEqual({
      emails: ["jane@x.com"],
      phones: ["5551234567"],
    });
  });

  it("is safe on empty or odd input", () => {
    expect(extractLeadContacts("")).toEqual({ emails: [], phones: [] });
    expect(extractLeadContacts(null)).toEqual({ emails: [], phones: [] });
    expect(extractLeadContacts(42)).toEqual({ emails: [], phones: [] });
  });
});

describe("newLeadContacts", () => {
  it("returns null when nothing was found", () => {
    expect(newLeadContacts(null, { emails: [], phones: [] })).toBeNull();
  });

  it("returns what is new against what is saved", () => {
    expect(newLeadContacts(null, { emails: ["a@b.com"], phones: ["5551234567"] })).toEqual({
      phone: "5551234567",
      email: "a@b.com",
    });
    expect(
      newLeadContacts({ lead_phone: "+15551234567", lead_email: null }, {
        emails: ["a@b.com"],
        phones: ["5551234567"],
      })
    ).toEqual({ phone: null, email: "a@b.com" });
  });

  it("returns null when the same contact is sent again", () => {
    expect(
      newLeadContacts({ lead_phone: "5551234567", lead_email: "A@b.com" }, {
        emails: ["a@b.com"],
        phones: ["+1 555 123 4567".replace(/\D/g, "")],
      })
    ).toBeNull();
  });

  it("reports a different number as new", () => {
    expect(
      newLeadContacts({ lead_phone: "5551234567" }, { emails: [], phones: ["5559876543"] })
    ).toEqual({ phone: "5559876543", email: null });
  });
});

describe("formatPhone / phoneKey", () => {
  it("formats US numbers and leaves others alone", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatPhone("+15551234567")).toBe("+1 (555) 123-4567");
    expect(formatPhone("+639171234567")).toBe("+639171234567");
  });

  it("keys the same number the same way", () => {
    expect(phoneKey("+15551234567")).toBe(phoneKey("5551234567"));
  });
});

describe("buildSlackLeadAlert", () => {
  const base = {
    botName: "Acme Bot",
    platform: "instagram",
    leadName: "Jane Doe",
    handle: "jane",
    phone: "5551234567",
    email: "jane@x.com",
    message: "call me <now> & thanks",
    conversationUrl: "https://app.example.com/conversations/abc",
  };

  it("carries the bot, lead, contact, message and a link", () => {
    const { text, blocks } = buildSlackLeadAlert(base);
    const json = JSON.stringify(blocks);
    expect(text).toContain("Jane Doe");
    expect(text).toContain("(555) 123-4567");
    expect(json).toContain("Acme Bot · Instagram");
    expect(json).toContain("jane@x.com");
    expect(json).toContain("Open conversation");
    expect(json).toContain("https://app.example.com/conversations/abc");
  });

  it("escapes Slack control characters in the lead's message", () => {
    const json = JSON.stringify(buildSlackLeadAlert(base).blocks);
    expect(json).toContain("&lt;now&gt; &amp; thanks");
    expect(json).not.toContain("<now>");
  });

  it("works with only an email and no link", () => {
    const { text, blocks } = buildSlackLeadAlert({
      ...base,
      leadName: null,
      phone: null,
      conversationUrl: null,
    });
    expect(text).toContain("@jane");
    expect(JSON.stringify(blocks)).not.toContain("Open conversation");
    expect(JSON.stringify(blocks)).not.toContain("Phone");
  });
});
