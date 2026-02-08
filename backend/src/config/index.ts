import dotenv from "dotenv";

dotenv.config();

const resolvePort = () => {
  if (!process.env.PORT) {
    return 3001;
  }

  const port = Number(process.env.PORT);
  return Number.isFinite(port) ? port : 3001;
};

export const config = {
  port: resolvePort(),
  
  // Google AI Studio (простой API ключ)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  
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
};
