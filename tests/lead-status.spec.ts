import { describe, it, expect } from "vitest";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABEL,
  leadStatusOf,
  parseStatusFilter,
  cleanRemark,
  statusChangeRemark,
  countByStatus,
  MAX_REMARK_CHARS,
} from "@/lib/lead-status";

describe("lead status", () => {
  it("has the four statuses in working order with labels", () => {
    expect(LEAD_STATUSES).toEqual(["pending", "reached_out", "follow_up", "done"]);
    expect(LEAD_STATUSES.map((s) => LEAD_STATUS_LABEL[s])).toEqual([
      "Pending",
      "Reached out",
      "Follow up",
      "Done",
    ]);
  });

  it("reads a missing or unknown status as pending", () => {
    expect(leadStatusOf(null)).toBe("pending");
    expect(leadStatusOf(undefined)).toBe("pending");
    expect(leadStatusOf("nope")).toBe("pending");
    expect(leadStatusOf("done")).toBe("done");
  });

  it("parses the filter, defaulting to all", () => {
    expect(parseStatusFilter("follow_up")).toBe("follow_up");
    expect(parseStatusFilter(undefined)).toBe("all");
    expect(parseStatusFilter("drop table")).toBe("all");
  });

  it("counts leads per status, null as pending", () => {
    expect(
      countByStatus([
        { lead_status: null },
        { lead_status: "pending" },
        { lead_status: "done" },
        { lead_status: "reached_out" },
      ])
    ).toEqual({ all: 4, pending: 2, reached_out: 1, follow_up: 0, done: 1 });
  });
});

describe("remarks", () => {
  it("trims and accepts a normal remark", () => {
    expect(cleanRemark("  Called, no answer. Try Friday.  ")).toBe("Called, no answer. Try Friday.");
  });

  it("rejects empty, non-text and over-long remarks", () => {
    expect(cleanRemark("   ")).toBeNull();
    expect(cleanRemark(42)).toBeNull();
    expect(cleanRemark("x".repeat(MAX_REMARK_CHARS + 1))).toBeNull();
    expect(cleanRemark("x".repeat(MAX_REMARK_CHARS))).not.toBeNull();
  });

  it("writes a readable status-change line", () => {
    expect(statusChangeRemark("pending", "reached_out")).toBe("Status: Pending → Reached out");
  });
});
