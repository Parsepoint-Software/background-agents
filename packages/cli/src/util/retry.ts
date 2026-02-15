/**
 * Exponential backoff with jitter for retrying operations.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in milliseconds. Default: 1000 */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Whether to abort retries. Return true from this to stop. */
  shouldAbort?: (error: unknown) => boolean;
}

/**
 * Retry an async operation with exponential backoff and full jitter.
 *
 * Delay formula: random(0, min(maxDelay, baseDelay * 2^attempt))
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 30000, shouldAbort } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (shouldAbort?.(error)) {
        throw error;
      }

      if (attempt < maxAttempts - 1) {
        const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
        const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
        const jitteredDelay = Math.random() * cappedDelay;
        await sleep(jitteredDelay);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
