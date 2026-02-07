import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getNextKey, markKeyRateLimited, markKeyDead } from "../utils/keyPool";

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

  const maxKeyRetries = 3;
  for (let attempt = 0; attempt < maxKeyRetries; attempt++) {
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
      break;
    } catch (error) {
      const msg = String((error as Record<string, unknown>)?.message ?? "");
      if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
        markKeyDead(apiKey);
        console.warn(`[ImageService] Invalid key, trying next (attempt ${attempt + 1}/${maxKeyRetries})...`);
        continue;
      }
      if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
        markKeyRateLimited(apiKey);
      }
      console.warn("Image generation failed, using fallback.", msg);
      break;
    }
  }

  return { imageUrl: fallback };
};
