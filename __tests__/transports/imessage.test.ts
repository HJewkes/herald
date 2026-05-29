import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendIMessage } from "../../src/transports/imessage.js";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe("sendIMessage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("writes script to temp file and calls osascript", () => {
    sendIMessage("+15551234567", "Hello from Herald");
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain("Hello from Herald");
    expect(scriptContent).toContain("+15551234567");
    expect(vi.mocked(execFileSync)).toHaveBeenCalledOnce();
    const [cmd, args] = vi.mocked(execFileSync).mock.calls[0];
    expect(cmd).toBe("osascript");
    expect((args as string[])[0]).toMatch(/herald-imessage-.*\.scpt$/);
  });

  it("escapes double quotes in message", () => {
    sendIMessage("+15551234567", 'Test "quotes" & backslash\\');
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).not.toContain('"quotes"');
    expect(scriptContent).toContain('\\"quotes\\"');
  });

  it("escapes newlines in message", () => {
    sendIMessage("+15551234567", "Line one\nLine two");
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain("Line one\\nLine two");
  });

  it("handles single quotes in message", () => {
    sendIMessage("+15551234567", "it's a test");
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain("it's a test");
  });

  it("escapes recipient", () => {
    sendIMessage('user"@evil.com', "Hello");
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain('user\\"@evil.com');
    expect(scriptContent).not.toContain('user"@evil.com');
  });
});
