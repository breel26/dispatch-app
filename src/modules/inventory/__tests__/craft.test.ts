import { describe, it, expect } from "vitest";
import {
  CRAFT_VALUES,
  CLASSIFICATION_VALUES,
  CRAFT_OPTIONS,
  CLASSIFICATION_OPTIONS,
  craftLabel,
  classificationLabel,
  describeCraft,
  isCraft,
  isClassification,
} from "../craft";

describe("craft values", () => {
  it("carries the ten trades personnel can come from", () => {
    expect(CRAFT_VALUES).toHaveLength(10);
  });

  // The order is the order the trades were given in, not alphabetical.
  // Alphabetical would bury the common trades among the rare ones, and the
  // dropdown renders straight from this tuple.
  it("preserves the given order rather than sorting", () => {
    expect([...CRAFT_VALUES]).toEqual([
      "CARPENTER",
      "LABORER",
      "IRONWORKER",
      "OPERATOR",
      "ELECTRICIAN",
      "PIPE_FITTER",
      "PLUMBER",
      "MASON",
      "PILE_DRIVER",
      "TEAMSTER",
    ]);
  });

  // Foreman and Superintendent were added after confirming these are real
  // job-site distinctions the company tracks, not just a trade-grade pair.
  it("offers apprentice, journeyman, foreman, and superintendent", () => {
    expect([...CLASSIFICATION_VALUES]).toEqual([
      "APPRENTICE",
      "JOURNEYMAN",
      "FOREMAN",
      "SUPERINTENDENT",
    ]);
  });
});

describe("labels", () => {
  // A missing label would render a raw enum constant on screen. The Record
  // type makes that a compile error; this proves it at runtime too.
  it("gives every craft a human label", () => {
    for (const craft of CRAFT_VALUES) {
      const label = craftLabel(craft);
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
  });

  it("gives every classification a human label", () => {
    for (const classification of CLASSIFICATION_VALUES) {
      expect(classificationLabel(classification)).toBeTruthy();
    }
  });

  // The two-word trades are the ones a dispatcher would notice getting
  // wrong, and the ones an automatic prettifier would most likely mangle.
  it("spells the two-word trades the way the trades do", () => {
    expect(craftLabel("PIPE_FITTER")).toBe("Pipe Fitter");
    expect(craftLabel("PILE_DRIVER")).toBe("Pile Driver");
  });

  it("labels the single-word trades in title case", () => {
    expect(craftLabel("CARPENTER")).toBe("Carpenter");
    expect(craftLabel("IRONWORKER")).toBe("Ironworker");
    expect(craftLabel("TEAMSTER")).toBe("Teamster");
  });

  it("describes a worker as trade then grade", () => {
    expect(describeCraft("PIPE_FITTER", "APPRENTICE")).toBe("Pipe Fitter, Apprentice");
    expect(describeCraft("CARPENTER", "JOURNEYMAN")).toBe("Carpenter, Journeyman");
  });
});

describe("select options", () => {
  // The dropdown and the Zod schema both build from CRAFT_VALUES, so a
  // trade can never be selectable in the UI but rejected by validation.
  it("offers one option per craft, in the same order", () => {
    expect(CRAFT_OPTIONS.map((o) => o.value)).toEqual([...CRAFT_VALUES]);
    expect(CRAFT_OPTIONS[0]).toEqual({ value: "CARPENTER", label: "Carpenter" });
  });

  it("offers one option per classification", () => {
    expect(CLASSIFICATION_OPTIONS.map((o) => o.value)).toEqual([...CLASSIFICATION_VALUES]);
  });
});

describe("guards", () => {
  it("accepts every valid value", () => {
    for (const craft of CRAFT_VALUES) expect(isCraft(craft)).toBe(true);
    for (const c of CLASSIFICATION_VALUES) expect(isClassification(c)).toBe(true);
  });

  // These guard the FormData boundary, where anything can arrive.
  it("rejects anything else, including the display label and empty input", () => {
    expect(isCraft("Pipe Fitter")).toBe(false); // the label, not the value
    expect(isCraft("carpenter")).toBe(false); // wrong case
    expect(isCraft("WELDER")).toBe(false); // not a trade we track
    expect(isCraft("")).toBe(false);
    expect(isClassification("Foreman")).toBe(false); // the label, not the value
    expect(isClassification("SITE_SUPERVISOR")).toBe(false); // not a grade we track
    expect(isClassification("")).toBe(false);
  });
});
