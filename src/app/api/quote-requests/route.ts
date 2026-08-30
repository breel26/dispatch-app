import { NextRequest, NextResponse } from "next/server";
import { createQuoteRequest } from "@/modules/procurement/repository";
import { sendQuoteRequest } from "@/modules/procurement/sendQuoteRequest";
import { handleApiError } from "@/modules/shared/apiError";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const quoteRequest = await createQuoteRequest(body);

    // Sending the email is best-effort here: if it fails, we don't want
    // to roll back the QuoteRequest we already created — the dispatcher
    // can retry sending without re-entering all the item data. This is
    // a deliberate choice (partial success over losing input), not an
    // oversight — the request stays DRAFT so "saved but not emailed" is
    // visible rather than silently mislabelled SENT.
    if (body.sendImmediately) {
      try {
        await sendQuoteRequest(quoteRequest.id);
      } catch (emailErr) {
        console.error("Failed to send quote request email:", emailErr);
        // Return 201 with a warning rather than failing the whole
        // request — the QuoteRequest record is valid and saved even
        // though the email didn't go out.
        return NextResponse.json(
          {
            ...quoteRequest,
            emailWarning:
              emailErr instanceof Error
                ? `Quote request saved but email failed to send: ${emailErr.message}`
                : "Quote request saved but email failed to send",
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json(quoteRequest, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
