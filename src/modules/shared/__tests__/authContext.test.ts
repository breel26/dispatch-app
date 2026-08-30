import { describe, it, expect } from "vitest";
import {
  DEFAULT_ORG_ID,
  resolveOrgId,
  resolveRole,
  assertCan,
  canPerform,
  ForbiddenError,
  type AuthContext,
} from "../authContext";

function ctx(role: AuthContext["role"]): AuthContext {
  return { userId: "user_1", orgId: "org_1", role };
}

describe("resolveOrgId", () => {
  it("uses the Clerk organization when there is one", () => {
    expect(resolveOrgId("org_2abc")).toBe("org_2abc");
  });

  // Clerk reports no organization when the feature is off or the user has
  // not picked one. Both collapse to the default org, which is what lets
  // this run as a single-company tool while every query is already scoped.
  it("falls back to the default org when Clerk reports none", () => {
    expect(resolveOrgId(null)).toBe(DEFAULT_ORG_ID);
    expect(resolveOrgId(undefined)).toBe(DEFAULT_ORG_ID);
    expect(resolveOrgId("")).toBe(DEFAULT_ORG_ID);
    expect(resolveOrgId("   ")).toBe(DEFAULT_ORG_ID);
  });

  // The migration backfilled existing rows with this exact value. If the
  // constant changes without a matching data migration, every pre-existing
  // job, vendor and PO becomes invisible to the app.
  it("uses the org id the migration backfilled", () => {
    expect(DEFAULT_ORG_ID).toBe("org_default");
  });
});

describe("resolveRole", () => {
  it("maps a Clerk org admin to admin", () => {
    expect(resolveRole("org_1", "org:admin")).toBe("admin");
  });

  it("maps any other org role to dispatcher", () => {
    expect(resolveRole("org_1", "org:member")).toBe("dispatcher");
    expect(resolveRole("org_1", null)).toBe("dispatcher");
    expect(resolveRole("org_1", "org:custom_role")).toBe("dispatcher");
  });

  // Deliberate and load-bearing: without this, a fresh single-org install
  // would have nobody able to issue a purchase order.
  it("treats everyone as admin in single-org mode", () => {
    expect(resolveRole(null, null)).toBe("admin");
    expect(resolveRole("", "org:member")).toBe("admin");
  });
});

describe("assertCan", () => {
  it("permits an admin to issue a purchase order", () => {
    expect(() => assertCan(ctx("admin"), "issuePurchaseOrder")).not.toThrow();
  });

  it("blocks a dispatcher from issuing a purchase order", () => {
    expect(() => assertCan(ctx("dispatcher"), "issuePurchaseOrder")).toThrow(ForbiddenError);
  });

  it("blocks a dispatcher from cancelling a job or adjusting stock", () => {
    expect(() => assertCan(ctx("dispatcher"), "cancelJob")).toThrow(ForbiddenError);
    expect(() => assertCan(ctx("dispatcher"), "adjustStock")).toThrow(ForbiddenError);
  });

  // The message reaches the dispatcher directly, so it should name the
  // action rather than say "forbidden".
  it("explains which action was refused", () => {
    expect(() => assertCan(ctx("dispatcher"), "issuePurchaseOrder")).toThrow(
      /issue a purchase order/
    );
  });

  it("is named so errorClassification can map it to a forbidden result", () => {
    // classifyError matches on err.name rather than instanceof, so this
    // name is load-bearing, not cosmetic.
    expect(new ForbiddenError("do that").name).toBe("ForbiddenError");
  });
});

describe("canPerform", () => {
  it("reports what the caller may do, for hiding UI they cannot use", () => {
    expect(canPerform(ctx("admin"), "issuePurchaseOrder")).toBe(true);
    expect(canPerform(ctx("dispatcher"), "issuePurchaseOrder")).toBe(false);
  });
});
