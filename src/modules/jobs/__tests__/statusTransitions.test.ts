import { describe, it, expect } from "vitest";
import {
  isValidJobStatusTransition,
  assertValidJobStatusTransition,
  InvalidJobStatusTransitionError,
} from "../statusTransitions";

describe("job status transitions", () => {
  it("allows PLANNED -> ACTIVE", () => {
    expect(isValidJobStatusTransition("PLANNED", "ACTIVE")).toBe(true);
  });

  it("allows ACTIVE -> ON_HOLD and back", () => {
    expect(isValidJobStatusTransition("ACTIVE", "ON_HOLD")).toBe(true);
    expect(isValidJobStatusTransition("ON_HOLD", "ACTIVE")).toBe(true);
  });

  it("allows cancellation from PLANNED, ACTIVE, and ON_HOLD", () => {
    expect(isValidJobStatusTransition("PLANNED", "CANCELLED")).toBe(true);
    expect(isValidJobStatusTransition("ACTIVE", "CANCELLED")).toBe(true);
    expect(isValidJobStatusTransition("ON_HOLD", "CANCELLED")).toBe(true);
  });

  it("rejects moving directly from PLANNED to COMPLETED", () => {
    expect(isValidJobStatusTransition("PLANNED", "COMPLETED")).toBe(false);
  });

  it("rejects any transition out of COMPLETED (terminal state)", () => {
    expect(isValidJobStatusTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(isValidJobStatusTransition("COMPLETED", "CANCELLED")).toBe(false);
  });

  it("rejects any transition out of CANCELLED (terminal state)", () => {
    expect(isValidJobStatusTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(isValidJobStatusTransition("CANCELLED", "PLANNED")).toBe(false);
  });

  it("rejects a 'transition' to the same status", () => {
    expect(isValidJobStatusTransition("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("assertValidJobStatusTransition throws a descriptive error on an illegal move", () => {
    expect(() =>
      assertValidJobStatusTransition("COMPLETED", "ACTIVE")
    ).toThrow(InvalidJobStatusTransitionError);
    expect(() =>
      assertValidJobStatusTransition("COMPLETED", "ACTIVE")
    ).toThrow("Cannot move a job from COMPLETED to ACTIVE");
  });

  it("assertValidJobStatusTransition does not throw on a legal move", () => {
    expect(() =>
      assertValidJobStatusTransition("PLANNED", "ACTIVE")
    ).not.toThrow();
  });
});
