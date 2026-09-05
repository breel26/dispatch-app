import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptPii, decryptPii, maskKeepingLast, PiiEncryptionKeyError } from "../pii";

// A fixed 32-byte test key, unrelated to any real environment's key. Set
// directly rather than reading .env, so this test does not depend on
// (or accidentally validate) whatever key happens to be configured
// locally or in CI.
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("encryptPii / decryptPii", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.PII_ENCRYPTION_KEY;
  });

  it("round-trips a value", () => {
    const encrypted = encryptPii("123-45-6789");
    expect(decryptPii(encrypted)).toBe("123-45-6789");
  });

  it("round-trips an empty string and unicode content", () => {
    expect(decryptPii(encryptPii(""))).toBe("");
    expect(decryptPii(encryptPii("Ñoño 日本語"))).toBe("Ñoño 日本語");
  });

  it("never stores the plaintext as a readable substring", () => {
    const encrypted = Buffer.from(encryptPii("123-45-6789"));
    expect(encrypted.toString("utf8")).not.toContain("123-45-6789");
    expect(encrypted.toString("latin1")).not.toContain("123-45-6789");
  });

  // GCM requires a fresh IV per encryption - reusing one with the same key
  // breaks its confidentiality guarantee. This is the property that
  // guarantee rests on: the same input must not produce the same output.
  it("produces different ciphertext for the same plaintext each time", () => {
    const a = encryptPii("123-45-6789");
    const b = encryptPii("123-45-6789");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    // ...but both still decrypt to the original value.
    expect(decryptPii(a)).toBe("123-45-6789");
    expect(decryptPii(b)).toBe("123-45-6789");
  });

  // The auth tag is what makes this "encrypted at rest" rather than just
  // "obfuscated at rest" - a single flipped byte must be detected, not
  // silently decrypted into corrupted-looking-plausible data.
  it("refuses to decrypt tampered ciphertext rather than returning garbage", () => {
    const encrypted = encryptPii("123-45-6789");
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 0xff; // flip the last byte

    expect(() => decryptPii(tampered)).toThrow();
  });

  it("refuses to decrypt with the wrong key", () => {
    const encrypted = encryptPii("123-45-6789");
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");

    expect(() => decryptPii(encrypted)).toThrow();
  });

  it("rejects a value too short to contain an IV and auth tag", () => {
    expect(() => decryptPii(Buffer.from("too short"))).toThrow(/too short/);
  });

  describe("key validation", () => {
    it("refuses to run with no key configured", () => {
      delete process.env.PII_ENCRYPTION_KEY;
      expect(() => encryptPii("x")).toThrow(PiiEncryptionKeyError);
    });

    it("refuses a key that is not valid base64 length for AES-256", () => {
      process.env.PII_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64"); // AES-128 length
      expect(() => encryptPii("x")).toThrow(/32 bytes/);
    });

    it("names the missing env var so the error is actionable", () => {
      delete process.env.PII_ENCRYPTION_KEY;
      expect(() => encryptPii("x")).toThrow(/PII_ENCRYPTION_KEY/);
    });
  });
});

describe("maskKeepingLast", () => {
  it("shows only the requested trailing digits", () => {
    expect(maskKeepingLast("123-45-6789")).toBe("••••6789");
  });

  it("defaults to the last 4 characters", () => {
    expect(maskKeepingLast("D1234567")).toBe("••••4567");
  });

  it("supports a different visible length", () => {
    expect(maskKeepingLast("123-45-6789", 2)).toBe("••••89");
  });
});
