import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { getNextKey, markKeyRateLimited, markKeyDead } from "../utils/keyPool";
import { getCachedImageUrl, storeImageInCache } from "./imageCacheService";

const FALLBACK_IMAGE_URL = "https://placehold.co/1024x1024/png?text=AM";
const VERTEX_AI_BASE_URL = "https://aiplatform.googleapis.com/v1";

/**
 * Генерация изображения через Vertex AI с API Key
 */
const generateImageVertexAI = async (prompt: string): Promise<string | null> => {
  if (!config.vertexAIApiKey) {
    console.warn("[ImageService] VERTEX_AI_API_KEY not set");
    return null;
  }

  const model = config.geminiImageModel || "imagen-3.0-generate-001";
  const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${model}:predict?key=${config.vertexAIApiKey}`;

  console.log(`[ImageService] Using Vertex AI with model: ${model}`);
  console.log(`[ImageService] Prompt: ${prompt.substring(0, 100)}...`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [
          {
            prompt: prompt,
          },
        ],
        parameters: {
          sampleCount: 1,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ImageService] Vertex AI error (${response.status}):`, errorText);
      return null;
    }

    const data = await response.json();
    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (imageBase64) {
      console.log(`[ImageService] ✅ Image generated successfully (Vertex AI)`);
      return `data:image/png;base64,${imageBase64}`;
    }

    console.warn("[ImageService] ⚠️ No image data in response");
    return null;
  } catch (error: any) {
    console.error("[ImageService] ❌ Vertex AI image generation failed:", error.message);
    return null;
  }
};

/**
 * Генерация изображения через Google AI Studio с key rotation
 */
const generateImageStudio = async (prompt: string): Promise<string | null> => {
  console.log(`[ImageService] Using Google AI Studio`);
  console.log(`[ImageService] Model: ${config.geminiImageModel}`);
  console.log(`[ImageService] Prompt: ${prompt.substring(0, 100)}...`);

  const maxKeyRetries = 3;
  for (let attempt = 0; attempt < maxKeyRetries; attempt++) {
    const apiKey = getNextKey();

    try {
      const client = new GoogleGenAI({ apiKey });
      const response = await client.models.generateImages({
        model: config.geminiImageModel,
        prompt: prompt,
        config: {
          numberOfImages: 1,
        },
      });

      const firstImage = response?.generatedImages?.[0];

      if (firstImage?.image?.imageBytes) {
        console.log(`[ImageService] ✅ Image generated successfully (${firstImage.image.imageBytes.length} bytes)`);
        return `data:image/png;base64,${firstImage.image.imageBytes}`;
      }

      console.warn("[ImageService] ⚠️ No image data in response");
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
      console.error("[ImageService] ❌ Google AI Studio error:", msg);
      break;
    }
  }

  return null;
};

/**
 * Главная функция генерации изображений
 */
export const generateImage = async (prompt: string) => {
  const safePrompt = prompt.trim().slice(0, 400);
  const encoded = encodeURIComponent(safePrompt);
  const fallback = safePrompt
    ? `https://placehold.co/1024x1024/png?text=${encoded}`
    : FALLBACK_IMAGE_URL;

  if (!safePrompt) {
    return { imageUrl: fallback };
  }

  const cachedUrl = await getCachedImageUrl(safePrompt);
  if (cachedUrl) {
    console.log("[ImageService] Cache hit for prompt");
    return { imageUrl: cachedUrl };
  }

  let imageUrl: string | null = null;

  // Пробуем Vertex AI если включен
  if (config.useVertexAI && config.vertexAIApiKey) {
    imageUrl = await generateImageVertexAI(safePrompt);
  }
  
  // Fallback на Google AI Studio
  if (!imageUrl && config.geminiApiKey) {
    imageUrl = await generateImageStudio(safePrompt);
  }

  if (imageUrl) {
    await storeImageInCache(safePrompt, imageUrl);
  }

  return { imageUrl: imageUrl || fallback };
};
