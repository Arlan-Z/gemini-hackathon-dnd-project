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
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3-pro-latest",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
