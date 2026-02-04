import { GoogleGenAI } from "@google/genai";
import { config } from "../config";

const FALLBACK_IMAGE_URL = "https://placehold.co/1024x1024/png?text=AM";

let cachedClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!config.geminiApiKey) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  return cachedClient;
};

export const generateImage = async (prompt: string) => {
  const safePrompt = prompt.trim().slice(0, 400);
  const encoded = encodeURIComponent(safePrompt);
  const fallback = safePrompt
    ? `https://placehold.co/1024x1024/png?text=${encoded}`
    : FALLBACK_IMAGE_URL;

  const client = getClient();
  if (!client || !safePrompt) {
    return { imageUrl: fallback };
  }

  try {
    const response = await client.models.generateImages({
      model: config.geminiImageModel, // например: 'imagen-4.0-generate-001'
      prompt: safePrompt,
      config: {
        numberOfImages: 1,
      },
    });

    const firstImage = response?.generatedImages?.[0];

    if (firstImage?.image?.imageBytes) {
      return {
        imageUrl: `data:image/png;base64,${firstImage.image.imageBytes}`,
      };
    }
  } catch (error) {
    console.warn("Gemini image generation failed, using fallback.", error);
  }

  return { imageUrl: fallback };
};
