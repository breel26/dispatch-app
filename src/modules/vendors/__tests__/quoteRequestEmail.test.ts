import { describe, it, expect } from "vitest";
import { buildQuoteRequestEmail } from "../quoteRequestEmail";

const baseInput = {
  vendorName: "ABC Concrete Supply",
  jobName: "Riverside Apartments Phase 2",
  jobSiteAddress: "123 Riverside Dr",
  replyToEmail: "dispatch@ourcompany.com",
  items: [
    { description: "Portland Cement", quantity: 50, unit: "bag" },
    { description: "Rebar 1/2in", quantity: 200, unit: "ft" },
  ],
};

describe("buildQuoteRequestEmail", () => {
  it("includes the vendor name, job name, and site address in the text body", () => {
    const email = buildQuoteRequestEmail(baseInput);
    expect(email.text).toContain("ABC Concrete Supply");
    expect(email.text).toContain("Riverside Apartments Phase 2");
    expect(email.text).toContain("123 Riverside Dr");
  });

  it("lists every item with quantity and unit in the text body", () => {
    const email = buildQuoteRequestEmail(baseInput);
    expect(email.text).toContain("Portland Cement: 50 bag");
    expect(email.text).toContain("Rebar 1/2in: 200 ft");
  });

  it("includes every item in the html body as a list item", () => {
    const email = buildQuoteRequestEmail(baseInput);
    expect(email.html).toContain("<li>Portland Cement: 50 bag</li>");
    expect(email.html).toContain("<li>Rebar 1/2in: 200 ft</li>");
  });

  it("sets a subject that includes the job name", () => {
    const email = buildQuoteRequestEmail(baseInput);
    expect(email.subject).toBe("Quote request: Riverside Apartments Phase 2");
  });

  it("throws if there are no items", () => {
    expect(() => buildQuoteRequestEmail({ ...baseInput, items: [] })).toThrow(
      "Cannot build a quote request email with no items"
    );
  });

  it("escapes HTML-unsafe characters in job/vendor names so markup can't break", () => {
    const email = buildQuoteRequestEmail({
      ...baseInput,
      jobName: `<script>alert("x")</script>`,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});
