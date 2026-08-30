import { auth } from "@clerk/nextjs/server";
import {
  NotAuthenticatedError,
  resolveOrgId,
  resolveRole,
  type AuthContext,
} from "./authContext";

// This file is deliberately thin: it is the one place that talks to Clerk,
// and it cannot be unit tested without a live Clerk session. All the logic
// worth testing - which org a request belongs to, which role it carries,
// what that role may do - lives in authContext.ts and is tested there.
// Keep this function to "ask Clerk, map the answer" and nothing more.
//
// Every Server Action calls this first and passes the result down. The
// middleware already rejects unauthenticated requests before they reach a
// page, so the throw here is a backstop for direct calls, not the primary
// gate.
export async function requireAuthContext(): Promise<AuthContext> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new NotAuthenticatedError();
  }

  return {
    userId,
    orgId: resolveOrgId(orgId),
    role: resolveRole(orgId, orgRole),
  };
}
