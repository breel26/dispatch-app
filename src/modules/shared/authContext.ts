// Who is asking, and what they are allowed to do.
//
// Deliberately free of any Clerk import so it stays pure and unit
// testable. The one function that actually calls Clerk lives in
// currentUser.ts, kept as thin as possible - the same split as
// vendors/resend.ts, where the untestable network call is isolated from
// the logic worth testing.

export type Role = "admin" | "dispatcher";

export interface AuthContext {
  userId: string;
  // Every tenant-owned row carries this, and every repository function
  // takes it. Scoping is a required argument rather than something a
  // query can forget, so a missing tenant filter is a type error.
  orgId: string;
  role: Role;
}

// What an install runs as before Clerk Organizations is turned on. It
// matches the value the architecture-hardening migration backfilled into
// existing rows - change one without the other and existing data becomes
// invisible to the app.
export const DEFAULT_ORG_ID = "org_default";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("You must be signed in to do that");
    this.name = "NotAuthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Your role does not permit you to ${action}`);
    this.name = "ForbiddenError";
  }
}

// Clerk reports no organization when the Organizations feature is off, or
// when a signed-in user has not selected one. Both collapse to the single
// default org, which is what makes this app work as an internal
// single-company tool today while every query is already tenant-scoped.
// Turning Clerk Organizations on later is then a configuration change and
// a backfill, not a schema migration.
export function resolveOrgId(clerkOrgId: string | null | undefined): string {
  return clerkOrgId && clerkOrgId.trim() !== "" ? clerkOrgId : DEFAULT_ORG_ID;
}

// Clerk org roles arrive as "org:admin" / "org:member".
//
// In single-org mode (no Clerk organization) everyone is an admin. That is
// a deliberate, and load-bearing, decision: the alternative is that on a
// fresh install nobody can issue a purchase order. Role enforcement below
// becomes meaningful the moment Organizations is enabled - which is why
// the checks are written now rather than retrofitted later.
export function resolveRole(
  clerkOrgId: string | null | undefined,
  clerkOrgRole: string | null | undefined
): Role {
  if (!clerkOrgId || clerkOrgId.trim() === "") return "admin";
  return clerkOrgRole === "org:admin" ? "admin" : "dispatcher";
}

// Actions that commit the company to money or destroy scheduling history
// are admin-only. Everything else - creating jobs, assigning crew, asking
// vendors for quotes - is what a dispatcher does all day and is not gated.
const ADMIN_ONLY_ACTIONS = {
  issuePurchaseOrder: "issue a purchase order",
  cancelJob: "cancel a job",
  adjustStock: "adjust stock levels directly",
} as const;

export type AdminOnlyAction = keyof typeof ADMIN_ONLY_ACTIONS;

export function assertCan(ctx: AuthContext, action: AdminOnlyAction): void {
  if (ctx.role !== "admin") {
    throw new ForbiddenError(ADMIN_ONLY_ACTIONS[action]);
  }
}

export function canPerform(ctx: AuthContext, action: AdminOnlyAction): boolean {
  return ctx.role === "admin" && action in ADMIN_ONLY_ACTIONS;
}
