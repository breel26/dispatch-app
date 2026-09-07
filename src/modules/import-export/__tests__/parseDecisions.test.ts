import { describe, it, expect } from "vitest";
import { parseDecisions } from "../importPlan";

describe("parseDecisions", () => {
  it("reads a well-formed set of answers", () => {
    const raw = JSON.stringify({
      "3": { action: "update" },
      "7": { action: "create", key: "03-05-0008" },
    });

    expect(parseDecisions(raw)).toEqual({
      3: { action: "update" },
      7: { action: "create", key: "03-05-0008" },
    });
  });

  it("returns null for nothing to read", () => {
    expect(parseDecisions(null)).toBeNull();
    expect(parseDecisions("")).toBeNull();
    expect(parseDecisions("   ")).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    expect(parseDecisions("{not json")).toBeNull();
  });

  // The rejections below all mean the same thing to the caller: no
  // decisions, so ask again. That is the safe direction - the alternative
  // to rejecting a hand-edited payload is writing something nobody chose.
  it("rejects an unknown action", () => {
    expect(parseDecisions(JSON.stringify({ "3": { action: "delete" } }))).toBeNull();
  });

  it("rejects a create with no number to create at", () => {
    expect(parseDecisions(JSON.stringify({ "3": { action: "create" } }))).toBeNull();
    expect(parseDecisions(JSON.stringify({ "3": { action: "create", key: "" } }))).toBeNull();
  });

  it("rejects a row key that is not a row number", () => {
    expect(parseDecisions(JSON.stringify({ nope: { action: "update" } }))).toBeNull();
    expect(parseDecisions(JSON.stringify({ "-1": { action: "update" } }))).toBeNull();
  });

  it("rejects a payload that is not an object of rows", () => {
    expect(parseDecisions(JSON.stringify([{ action: "update" }]))).toBeNull();
    expect(parseDecisions(JSON.stringify("update"))).toBeNull();
    expect(parseDecisions(JSON.stringify(null))).toBeNull();
  });

  it("keys the result by number, matching how rows are looked up", () => {
    const decisions = parseDecisions(JSON.stringify({ "12": { action: "update" } }));
    // The commit loop indexes by planned.row, which is a number - a
    // string-keyed object would silently miss every lookup.
    expect(decisions?.[12]).toEqual({ action: "update" });
  });
});
