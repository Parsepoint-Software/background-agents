import { describe, it, expect, vi } from "vitest";
import { retry } from "./retry.js";

describe("retry", () => {
  it("returns the result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("ok");

    const result = await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(retry(fn, { maxAttempts: 3, baseDelayMs: 1 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("respects shouldAbort to stop early", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fatal"));

    await expect(
      retry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1,
        shouldAbort: (err) => err instanceof Error && err.message === "fatal",
      })
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes attempt number to the function", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");

    await retry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(fn).toHaveBeenNthCalledWith(1, 0);
    expect(fn).toHaveBeenNthCalledWith(2, 1);
  });

  it("defaults to 3 maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));

    await expect(retry(fn, { baseDelayMs: 1 })).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("caps delay at maxDelayMs", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue("ok");

    // With baseDelay=10000 and maxDelay=1, the actual delay should be capped
    const start = Date.now();
    await retry(fn, {
      maxAttempts: 2,
      baseDelayMs: 10000,
      maxDelayMs: 1,
    });
    const elapsed = Date.now() - start;
    // Should not have waited 10s
    expect(elapsed).toBeLessThan(1000);
  });
});
