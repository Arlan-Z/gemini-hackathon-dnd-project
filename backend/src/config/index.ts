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
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiImageModel: process.env.GEMINI_IMAGE_GEN_MODEL ?? "imagen-4.0-generate-001",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
