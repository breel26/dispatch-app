import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// sendQuoteRequest now reads through the repository rather than reaching
// for the Prisma client directly - it was the one place in the codebase
// that bypassed its own module's data-access layer.
const mockGetQuoteRequestById = vi.fn();
const mockSendVendorEmail = vi.fn();
const mockMarkQuoteRequestSent = vi.fn();

vi.mock("@/modules/vendors/resend", () => ({
  sendVendorEmail: (...args: unknown[]) => mockSendVendorEmail(...args),
}));

vi.mock("../repository", () => ({
  getQuoteRequestById: (...args: unknown[]) => mockGetQuoteRequestById(...args),
  markQuoteRequestSent: (...args: unknown[]) => mockMarkQuoteRequestSent(...args),
}));

const QUOTE_REQUEST = {
  id: "qr-1",
  vendor: { name: "Acme Concrete", email: "sales@acme.example" },
  job: { name: "Riverside Phase 2", siteAddress: "123 Riverside Dr" },
  items: [{ quantity: 12, material: { name: "3000 psi concrete", unit: "CY" }, equipment: null }],
};

describe("sendQuoteRequest", () => {
  beforeEach(() => {
    mockGetQuoteRequestById.mockReset();
    mockSendVendorEmail.mockReset();
    mockMarkQuoteRequestSent.mockReset();
    process.env.RESEND_API_KEY = "test-key";
    process.env.DISPATCH_FROM_EMAIL = "dispatch@example.com";
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.DISPATCH_FROM_EMAIL;
    delete process.env.DISPATCH_REPLY_TO_EMAIL;
  });

  it("sends the email to the vendor and then marks the request sent", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    mockGetQuoteRequestById.mockResolvedValue(QUOTE_REQUEST);
    mockSendVendorEmail.mockResolvedValue({ id: "email-1" });
    mockMarkQuoteRequestSent.mockResolvedValue({ id: "qr-1", status: "SENT" });

    await sendQuoteRequest("org-1", "qr-1");

    expect(mockSendVendorEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendVendorEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("sales@acme.example");
    expect(sent.fromEmail).toBe("dispatch@example.com");
    expect(sent.subject).toContain("Riverside Phase 2");
    expect(sent.text).toContain("3000 psi concrete");
    expect(mockMarkQuoteRequestSent).toHaveBeenCalledWith("org-1", "qr-1");
  });

  // Reply-To is separate from From because Resend constrains the sender
  // to a verified domain, while replies can go to any inbox.
  it("routes replies to DISPATCH_REPLY_TO_EMAIL when it is set", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    process.env.DISPATCH_REPLY_TO_EMAIL = "dispatch.app.test@gmail.com";
    mockGetQuoteRequestById.mockResolvedValue(QUOTE_REQUEST);
    mockSendVendorEmail.mockResolvedValue({ id: "email-1" });
    mockMarkQuoteRequestSent.mockResolvedValue({ id: "qr-1", status: "SENT" });

    await sendQuoteRequest("org-1", "qr-1");

    const sent = mockSendVendorEmail.mock.calls[0][0];
    expect(sent.replyToEmail).toBe("dispatch.app.test@gmail.com");
    // The sender must stay the verified-domain address, not the reply-to.
    expect(sent.fromEmail).toBe("dispatch@example.com");
  });

  it("falls back to the From address for replies when DISPATCH_REPLY_TO_EMAIL is unset", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    mockGetQuoteRequestById.mockResolvedValue(QUOTE_REQUEST);
    mockSendVendorEmail.mockResolvedValue({ id: "email-1" });
    mockMarkQuoteRequestSent.mockResolvedValue({ id: "qr-1", status: "SENT" });

    await sendQuoteRequest("org-1", "qr-1");

    const sent = mockSendVendorEmail.mock.calls[0][0];
    expect(sent.replyToEmail).toBe("dispatch@example.com");
  });

  // This is the regression guard for the original bug: the request was
  // being marked SENT regardless of whether an email ever went out.
  it("does NOT mark the request sent when the email fails", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    mockGetQuoteRequestById.mockResolvedValue(QUOTE_REQUEST);
    mockSendVendorEmail.mockRejectedValue(new Error("Resend is down"));

    await expect(sendQuoteRequest("org-1", "qr-1")).rejects.toThrow("Resend is down");
    expect(mockMarkQuoteRequestSent).not.toHaveBeenCalled();
  });

  it("throws EmailNotConfiguredError and sends nothing when RESEND_API_KEY is unset", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    delete process.env.RESEND_API_KEY;

    await expect(sendQuoteRequest("org-1", "qr-1")).rejects.toThrow(/RESEND_API_KEY is not set/);
    expect(mockSendVendorEmail).not.toHaveBeenCalled();
    expect(mockMarkQuoteRequestSent).not.toHaveBeenCalled();
  });

  it("throws EmailNotConfiguredError when DISPATCH_FROM_EMAIL is unset", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    delete process.env.DISPATCH_FROM_EMAIL;

    await expect(sendQuoteRequest("org-1", "qr-1")).rejects.toThrow(/DISPATCH_FROM_EMAIL is not set/);
    expect(mockSendVendorEmail).not.toHaveBeenCalled();
  });

  it("refuses to send when the vendor has no email on file", async () => {
    const { sendQuoteRequest } = await import("../sendQuoteRequest");
    mockGetQuoteRequestById.mockResolvedValue({
      ...QUOTE_REQUEST,
      vendor: { name: "Acme Concrete", email: "" },
    });

    await expect(sendQuoteRequest("org-1", "qr-1")).rejects.toThrow(/no email address on file/);
    expect(mockSendVendorEmail).not.toHaveBeenCalled();
    expect(mockMarkQuoteRequestSent).not.toHaveBeenCalled();
  });
});
