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
  
  // Google AI Studio (простой API ключ)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** All available API keys for round-robin rotation */
  geminiApiKeys: resolveApiKeys(),
  
  // Vertex AI настройки
  useVertexAI: process.env.USE_VERTEX_AI === "true",
  vertexAIApiKey: process.env.VERTEX_AI_API_KEY ?? "", // Новый параметр для API Key
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "",
  vertexAILocation: process.env.VERTEX_AI_LOCATION ?? "us-central1",
  
  // Модели
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp",
  geminiImageModel: process.env.GEMINI_IMAGE_GEN_MODEL ?? "imagen-3.0-generate-001",
  
  corsOrigin: process.env.CORS_ORIGIN ?? "*",

  // Context cache (Gemini Developer API only in this project)
  contextCacheEnabled: process.env.CONTEXT_CACHE_ENABLED !== "false",
  contextCacheTtl:
    process.env.CONTEXT_CACHE_TTL?.trim() || "3600s",
  contextCacheDisplayName:
    process.env.CONTEXT_CACHE_DISPLAY_NAME?.trim() || "orchestrator-cache",

  // Google Cloud Storage (image cache)
  imageCacheEnabled: process.env.IMAGE_CACHE_ENABLED !== "false",
  gcloudProjectId: process.env.GCLOUD_PROJECT_ID ?? "",
  gcloudClientEmail: process.env.GCLOUD_CLIENT_EMAIL ?? "",
  gcloudPrivateKey: (process.env.GCLOUD_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  gcloudBucket:
    process.env.GCLOUD_BUCKET?.trim() ||
    (process.env.GCLOUD_PROJECT_ID
      ? `${process.env.GCLOUD_PROJECT_ID}-image-cache`
      : ""),
  gcloudSignedUrlTtl: process.env.GCLOUD_SIGNED_URL_TTL ?? "3600s",
};
