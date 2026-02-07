import dotenv from "dotenv";

dotenv.config();

const resolvePort = () => {
  if (!process.env.PORT) {
    return 3001;
  }

  const port = Number(process.env.PORT);
  return Number.isFinite(port) ? port : 3001;
};

/**
 * Парсит ключи из GEMINI_API_KEYS (через запятую) или GEMINI_API_KEY (один).
 */
const resolveApiKeys = (): string[] => {
  const multi = process.env.GEMINI_API_KEYS;
  if (multi) {
    return multi.split(",").map((k) => k.trim()).filter(Boolean);
  }
  const single = process.env.GEMINI_API_KEY;
  if (single?.trim()) {
    return [single.trim()];
  }
  return [];
};

export const config = {
  port: resolvePort(),
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** All available API keys for round-robin rotation */
  geminiApiKeys: resolveApiKeys(),
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiImageModel: process.env.GEMINI_IMAGE_GEN_MODEL ?? "imagen-4.0-generate-001",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
