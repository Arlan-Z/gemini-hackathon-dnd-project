import { config } from "../config";

interface KeyState {
  key: string;
  cooldownUntil: number;
  dead: boolean;
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

  pool = keys.map((key) => ({ key, cooldownUntil: 0, dead: false }));
  console.log(`[KeyPool] Initialized with ${pool.length} key(s)`);
};

export const getNextKey = (): string => {
  initPool();
  const now = Date.now();
  const len = pool.length;

  for (let i = 0; i < len; i++) {
    const idx = (cursor + i) % len;
    if (!pool[idx].dead && pool[idx].cooldownUntil <= now) {
      cursor = (idx + 1) % len;
      return pool[idx].key;
    }
  }

  let earliest = -1;
  for (let i = 0; i < len; i++) {
    if (pool[i].dead) continue;
    if (earliest === -1 || pool[i].cooldownUntil < pool[earliest].cooldownUntil) {
      earliest = i;
    }
  }

  if (earliest === -1) {
    throw new Error("[KeyPool] All API keys are invalid. Check your GEMINI_API_KEYS in .env");
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

export const markKeyDead = (key: string): void => {
  initPool();
  const entry = pool.find((k) => k.key === key);
  if (entry && !entry.dead) {
    entry.dead = true;
    const alive = pool.filter((k) => !k.dead).length;
    console.error(
      `[KeyPool] Key ...${key.slice(-6)} marked INVALID (permanently removed). ${alive} key(s) remaining.`,
    );
  }
};
