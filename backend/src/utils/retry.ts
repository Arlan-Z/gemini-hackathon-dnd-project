/**
 * Retry with backoff for Gemini API 429 errors.
 * On 429, marks key in pool and waits before retrying.
 */

import { markKeyRateLimited } from "./keyPool";

const isRateLimitError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (e.status === 429) return true;
  const msg = String(e.message ?? "");
  return msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
};

const extractRetryDelay = (error: unknown): number | null => {
  const msg = String((error as Record<string, unknown>)?.message ?? "");
  const match = msg.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RetryOpts {
  maxRetries?: number;
  label?: string;
  apiKey?: string;
}

export const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {},
): Promise<T> => {
  const { maxRetries = 2, label = "API", apiKey } = opts;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === maxRetries) {
        throw error;
      }

      const serverDelay = extractRetryDelay(error);
      const cooldown = serverDelay ?? 35_000;

      if (apiKey) markKeyRateLimited(apiKey, cooldown);

      const waitMs = Math.min(cooldown, 60_000);
      console.warn(
        `[Retry] ${label} 429 (attempt ${attempt + 1}/${maxRetries}). ` +
        `Waiting ${(waitMs / 1000).toFixed(0)}s...`,
      );
      await sleep(waitMs);
    }
  }

  throw new Error(`${label}: rate limit exceeded after retries`);
};
