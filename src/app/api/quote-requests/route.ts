import { NextRequest, NextResponse } from "next/server";
import { createQuoteRequest } from "@/modules/procurement/repository";
import { getVendorById } from "@/modules/vendors/repository";
import { getJobById } from "@/modules/jobs/repository";
import { buildQuoteRequestEmail } from "@/modules/vendors/quoteRequestEmail";
import { sendVendorEmail } from "@/modules/vendors/resend";
import { markQuoteRequestSent } from "@/modules/procurement/repository";
import { handleApiError } from "@/modules/shared/apiError";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const quoteRequest = await createQuoteRequest(body);

    // Sending the email is best-effort here: if it fails, we don't want
    // to roll back the QuoteRequest we already created — the dispatcher
    // can retry sending without re-entering all the item data. This is
    // a deliberate choice (partial success over losing input), not an
    // oversight — flagging it since "the request exists but wasn't
    // emailed yet" is a real state the UI needs to show.
    if (body.sendImmediately) {
      const [vendor, job] = await Promise.all([
        getVendorById(quoteRequest.vendorId),
        getJobById(quoteRequest.jobId),
      ]);

      if (vendor && job && body.items) {
        const email = buildQuoteRequestEmail({
          vendorName: vendor.name,
          jobName: job.name,
          jobSiteAddress: job.siteAddress,
          replyToEmail: process.env.DISPATCH_FROM_EMAIL ?? "",
          items: body.items,
        });

        try {
          await sendVendorEmail({
            ...email,
            toEmail: vendor.email,
            replyToEmail: process.env.DISPATCH_FROM_EMAIL ?? "",
            fromEmail: process.env.DISPATCH_FROM_EMAIL ?? "",
          });
          await markQuoteRequestSent(quoteRequest.id);
        } catch (emailErr) {
          console.error("Failed to send quote request email:", emailErr);
          // Return 201 with a warning rather than failing the whole
          // request — the QuoteRequest record is valid and saved even
          // though the email didn't go out.
          return NextResponse.json(
            { ...quoteRequest, emailWarning: "Quote request saved but email failed to send" },
            { status: 201 }
          );
        }
      }
    }

    return NextResponse.json(quoteRequest, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
