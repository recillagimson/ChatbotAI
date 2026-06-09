import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeReply } from "./sanitize.ts";

test("replaces a spaced em dash with a comma", () => {
  const out = sanitizeReply("You're welcome — happy to help! Reach out anytime.");
  assert.equal(out, "You're welcome, happy to help! Reach out anytime.");
  assert.ok(!out.includes("—"));
});

test("replaces an em dash with no surrounding spaces", () => {
  assert.equal(
    sanitizeReply("still on that—give me a sec"),
    "still on that, give me a sec"
  );
});

test("keeps numeric ranges readable with a hyphen", () => {
  assert.equal(sanitizeReply("0% for 12–18 months"), "0% for 12-18 months");
  assert.equal(sanitizeReply("about 600—700 a month"), "about 600-700 a month");
});

test("strips en dash and horizontal bar too", () => {
  const out = sanitizeReply("a – b ― c");
  assert.ok(!/[‒–—―]/.test(out));
});

test("leaves clean text and normal hyphens untouched", () => {
  assert.equal(
    sanitizeReply("for sure, lmk if you want in. its a no-brainer"),
    "for sure, lmk if you want in. its a no-brainer"
  );
});

test("handles empty string", () => {
  assert.equal(sanitizeReply(""), "");
});
