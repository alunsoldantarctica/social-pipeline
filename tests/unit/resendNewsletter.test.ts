import { describe, expect, it } from "vitest";
import { readConfig } from "../../convex/admin/resendConfig";

describe("readConfig", () => {
  it("returns EMPTY_CONFIG for null", () => {
    const result = readConfig(null);
    expect(result).toEqual({ autoSend: false });
  });

  it("returns EMPTY_CONFIG for undefined", () => {
    const result = readConfig(undefined);
    expect(result).toEqual({ autoSend: false });
  });

  it("returns EMPTY_CONFIG for a non-object primitive", () => {
    const result = readConfig("string");
    expect(result).toEqual({ autoSend: false });
  });

  it("defaults autoSend to false when resendAutoSend is absent", () => {
    const result = readConfig({});
    expect(result.autoSend).toBe(false);
  });

  it("maps resendAutoSend=true → autoSend=true", () => {
    const result = readConfig({ resendAutoSend: true });
    expect(result.autoSend).toBe(true);
  });

  it("maps resendAutoSend=false → autoSend=false", () => {
    const result = readConfig({ resendAutoSend: false });
    expect(result.autoSend).toBe(false);
  });

  it("maps resendAudienceId to audienceId", () => {
    const result = readConfig({ resendAudienceId: "aud_123" });
    expect(result.audienceId).toBe("aud_123");
  });

  it("maps resendFromAddress to fromAddress", () => {
    const result = readConfig({ resendFromAddress: "hello@example.com" });
    expect(result.fromAddress).toBe("hello@example.com");
  });

  it("maps resendReplyTo to replyTo", () => {
    const result = readConfig({ resendReplyTo: "reply@example.com" });
    expect(result.replyTo).toBe("reply@example.com");
  });

  it("maps all fields correctly from a full row", () => {
    const row = {
      resendAutoSend: true,
      resendAudienceId: "aud_abc",
      resendFromAddress: "news@example.com",
      resendReplyTo: "no-reply@example.com",
      // extra fields on the DB row should be ignored
      key: "resend",
      updatedAt: 1700000000000,
    };
    const result = readConfig(row);
    expect(result).toEqual({
      autoSend: true,
      audienceId: "aud_abc",
      fromAddress: "news@example.com",
      replyTo: "no-reply@example.com",
    });
  });

  it("leaves optional fields undefined when absent", () => {
    const result = readConfig({ resendAutoSend: false });
    expect(result.audienceId).toBeUndefined();
    expect(result.fromAddress).toBeUndefined();
    expect(result.replyTo).toBeUndefined();
  });
});
