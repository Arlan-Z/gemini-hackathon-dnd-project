import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getNextKey, markKeyRateLimited } from "../utils/keyPool";

const FALLBACK_IMAGE_URL = "https://placehold.co/1024x1024/png?text=AM";

export const generateImage = async (prompt: string) => {
  const safePrompt = prompt.trim().slice(0, 400);
  const encoded = encodeURIComponent(safePrompt);
  const fallback = safePrompt
    ? `https://placehold.co/1024x1024/png?text=${encoded}`
    : FALLBACK_IMAGE_URL;

  if (!safePrompt) {
    return { imageUrl: fallback };
  }

  const apiKey = getNextKey();

  try {
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateImages({
      model: config.geminiImageModel,
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
    // Mark key on rate limit, but don't crash — just use fallback
    const msg = String((error as Record<string, unknown>)?.message ?? "");
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      markKeyRateLimited(apiKey);
    }
    console.warn("Image generation failed, using fallback.", (error as Error)?.message);
  }

  return { imageUrl: fallback };
};
