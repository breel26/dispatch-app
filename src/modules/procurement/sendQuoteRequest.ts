import { prisma } from "@/modules/shared/prisma";
import { buildQuoteRequestEmail } from "@/modules/vendors/quoteRequestEmail";
import { sendVendorEmail } from "@/modules/vendors/resend";
import { toQuoteRequestEmailItems } from "./quoteRequestEmailItems";
import { markQuoteRequestSent } from "./repository";
import type { QuoteRequest } from "@prisma/client";

// Thrown when the Resend environment variables aren't configured. Named
// (and registered in shared/errorClassification.ts) so the dispatcher
// sees "email is not configured" instead of a generic internal error —
// this is a setup problem they can act on, not a bug.
export class EmailNotConfiguredError extends Error {
  constructor(missing: string) {
    super(
      `Vendor email is not configured: ${missing} is not set. ` +
        `Set it in .env and restart the server before sending quote requests.`
    );
    this.name = "EmailNotConfiguredError";
  }
}

export class VendorEmailMissingError extends Error {
  constructor(vendorName: string) {
    super(`Vendor "${vendorName}" has no email address on file`);
    this.name = "VendorEmailMissingError";
  }
}

// Sends the quote request to its vendor and only then marks it SENT.
//
// The ordering matters: marking SENT before a confirmed send is what
// previously let the UI display "SENT" for a request whose email never
// left. If the send throws, the request stays DRAFT and the dispatcher
// can retry without re-entering the items.
//
// This is the single path for emailing a quote request — both the
// Server Action (the UI) and POST /api/quote-requests call it. Don't
// reimplement the build-and-send inline; that divergence is exactly the
// bug this function was extracted to fix.
export async function sendQuoteRequest(quoteRequestId: string): Promise<QuoteRequest> {
  const fromEmail = process.env.DISPATCH_FROM_EMAIL;
  if (!process.env.RESEND_API_KEY) {
    throw new EmailNotConfiguredError("RESEND_API_KEY");
  }
  if (!fromEmail) {
    throw new EmailNotConfiguredError("DISPATCH_FROM_EMAIL");
  }

  // From and Reply-To are deliberately separate. The From address is
  // constrained by Resend: it must be on a domain we've verified (SPF +
  // DKIM records published under it), which rules out a free provider
  // address like gmail.com. Replies have no such constraint, so vendor
  // responses can be routed to whatever inbox the team actually reads.
  // Falls back to the From address when unset, preserving the previous
  // single-address behaviour.
  const replyToEmail = process.env.DISPATCH_REPLY_TO_EMAIL || fromEmail;

  const quoteRequest = await prisma.quoteRequest.findUniqueOrThrow({
    where: { id: quoteRequestId },
    include: {
      vendor: true,
      job: true,
      items: { include: { material: true, equipment: true } },
    },
  });

  if (!quoteRequest.vendor.email) {
    throw new VendorEmailMissingError(quoteRequest.vendor.name);
  }

  const email = buildQuoteRequestEmail({
    vendorName: quoteRequest.vendor.name,
    jobName: quoteRequest.job.name,
    jobSiteAddress: quoteRequest.job.siteAddress,
    replyToEmail,
    items: toQuoteRequestEmailItems(quoteRequest.items),
  });

  await sendVendorEmail({
    ...email,
    toEmail: quoteRequest.vendor.email,
    replyToEmail,
    fromEmail,
  });

  return markQuoteRequestSent(quoteRequestId);
}
