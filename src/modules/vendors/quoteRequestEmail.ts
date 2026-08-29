export interface QuoteRequestEmailItem {
  description: string; // e.g. "Portland Cement (50 bags)" or "Excavator rental, 2 weeks"
  quantity: number;
  unit: string;
}

export interface QuoteRequestEmailInput {
  vendorName: string;
  jobName: string;
  jobSiteAddress: string;
  items: QuoteRequestEmailItem[];
  replyToEmail: string;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

// Builds the subject/text/html for a vendor quote-request email. Kept
// separate from the actual send call (resend.ts) so this — the part
// that's easy to get subtly wrong (formatting, missing an item, wrong
// address) — can be unit tested without a live network call or API key.
export function buildQuoteRequestEmail(input: QuoteRequestEmailInput): BuiltEmail {
  if (input.items.length === 0) {
    throw new Error("Cannot build a quote request email with no items");
  }

  const subject = `Quote request: ${input.jobName}`;

  const itemLines = input.items
    .map((item) => `  - ${item.description}: ${item.quantity} ${item.unit}`)
    .join("\n");

  const text = [
    `Hi ${input.vendorName},`,
    "",
    `We'd like to request a quote for the following for our job "${input.jobName}" at ${input.jobSiteAddress}:`,
    "",
    itemLines,
    "",
    `Please reply to this email with your pricing and lead time.`,
    "",
    "Thank you,",
  ].join("\n");

  const itemListHtml = input.items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description)}: ${item.quantity} ${escapeHtml(item.unit)}</li>`
    )
    .join("");

  const html = `
    <p>Hi ${escapeHtml(input.vendorName)},</p>
    <p>We'd like to request a quote for the following for our job "${escapeHtml(
      input.jobName
    )}" at ${escapeHtml(input.jobSiteAddress)}:</p>
    <ul>${itemListHtml}</ul>
    <p>Please reply to this email with your pricing and lead time.</p>
    <p>Thank you,</p>
  `.trim();

  return { subject, text, html };
}

// Minimal HTML-escaping so a material name or job name containing
// special characters can't break the email markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
