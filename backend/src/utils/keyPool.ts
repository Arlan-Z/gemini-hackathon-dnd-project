/**
 * API Key Pool — round-robin ротация ключей Gemini API.
 *
 * Ключи задаются через GEMINI_API_KEYS (через запятую) или GEMINI_API_KEY (один).
 * При 429 ключ помечается "остывающим" и пропускается до истечения cooldown.
 */

import { config } from "../config";

interface KeyState {
  key: string;
  cooldownUntil: number;
}

let pool: KeyState[] = [];
let cursor = 0;

const DEFAULT_COOLDOWN_MS = 35_000;

const initPool = () => {
  if (pool.length > 0) return;

  const keys = config.geminiApiKeys;
  if (keys.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEYS or GEMINI_API_KEY in .env",
    );
  }

  pool = keys.map((key) => ({ key, cooldownUntil: 0 }));
  console.log(`[KeyPool] Initialized with ${pool.length} key(s)`);
};

export const getNextKey = (): string => {
  initPool();
  const now = Date.now();
  const len = pool.length;

  for (let i = 0; i < len; i++) {
    const idx = (cursor + i) % len;
    if (pool[idx].cooldownUntil <= now) {
      cursor = (idx + 1) % len;
      return pool[idx].key;
    }
  }

  let earliest = 0;
  for (let i = 1; i < len; i++) {
    if (pool[i].cooldownUntil < pool[earliest].cooldownUntil) {
      earliest = i;
    }
  }
  cursor = (earliest + 1) % len;
  return pool[earliest].key;
};

export const markKeyRateLimited = (
  key: string,
  cooldownMs?: number,
): void => {
  initPool();
  const entry = pool.find((k) => k.key === key);
  if (entry) {
    entry.cooldownUntil =
      Date.now() + (cooldownMs ?? DEFAULT_COOLDOWN_MS);
    console.warn(
      `[KeyPool] Key ...${key.slice(-6)} rate-limited, cooldown ${((cooldownMs ?? DEFAULT_COOLDOWN_MS) / 1000).toFixed(0)}s`,
    );
  }
};
