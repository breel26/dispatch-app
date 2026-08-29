// This file is deliberately thin: it's the one piece of the vendor
// email flow that can't be meaningfully unit tested (it requires a live
// Resend API key and actually sends real email). All the logic worth
// testing — subject/body construction — lives in quoteRequestEmail.ts
// and is tested there. Keep this function to "call Resend, return the
// result" and nothing more, so there's as little untested surface as
// possible.
//
// NOT verified in this sandbox: no RESEND_API_KEY is available here, and
// the send was not attempted. Test this against Resend's sandbox/test
// mode before using it against real vendor addresses.

import { Resend } from "resend";
import type { BuiltEmail } from "./quoteRequestEmail";

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface SendVendorEmailInput extends BuiltEmail {
  toEmail: string;
  replyToEmail: string;
  fromEmail: string; // e.g. "dispatch@yourcompany.com" - must be a verified Resend sender
}

export async function sendVendorEmail(input: SendVendorEmailInput) {
  const client = getResendClient();
  return client.emails.send({
    from: input.fromEmail,
    to: input.toEmail,
    replyTo: input.replyToEmail,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
