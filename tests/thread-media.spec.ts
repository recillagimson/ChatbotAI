import { describe, it, expect } from "vitest";
import { newestImageIds, EAGER_THREAD_IMAGES } from "@/lib/thread-media";

const img = (id: string) => ({ id, media_url: `p/${id}.jpg`, media_type: "image/jpeg" });
const text = (id: string) => ({ id, media_url: null, media_type: null });
const video = (id: string) => ({ id, media_url: `p/${id}.mp4`, media_type: "video/mp4" });
const sorted = (s: Set<string>) => [...s].sort();

describe("newestImageIds", () => {
  it("defaults to the three newest images of an oldest-first thread", () => {
    expect(EAGER_THREAD_IMAGES).toBe(3);
    const thread = [img("a"), img("b"), text("t1"), img("c"), img("d"), text("t2"), img("e")];
    expect(sorted(newestImageIds(thread))).toEqual(["c", "d", "e"]);
  });
  it("counts only attachments that render as an image", () => {
    const thread = [
      img("a"), video("v1"), img("b"),
      { id: "untyped", media_url: "p/x", media_type: null },
      { id: "doc", media_url: "p/d.pdf", media_type: "application/pdf" },
      video("v2"),
    ];
    expect(sorted(newestImageIds(thread))).toEqual(["a", "b"]);
  });
  it("needs a media_url, not just an image type", () => {
    expect(newestImageIds([{ id: "g", media_url: null, media_type: "image/png" }]).size).toBe(0);
  });
  it("returns every image when the thread has fewer than the count", () => {
    expect(sorted(newestImageIds([text("t"), img("a")]))).toEqual(["a"]);
  });
  it("honours an explicit count, including zero", () => {
    const thread = [img("a"), img("b"), img("c")];
    expect([...newestImageIds(thread, 1)]).toEqual(["c"]);
    expect(newestImageIds(thread, 0).size).toBe(0);
  });
  it("handles an empty thread", () => {
    expect(newestImageIds([]).size).toBe(0);
  });
});
