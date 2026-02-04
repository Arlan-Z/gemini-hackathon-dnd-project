import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";

const FALLBACK_IMAGE_URL = "https://placehold.co/1024x1024/png?text=AM";

let cachedImageModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null =
  null;

const getImageModel = () => {
  if (!config.geminiApiKey || !config.geminiImageModel) {
    return null;
  }

  if (!cachedImageModel) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    cachedImageModel = genAI.getGenerativeModel({
      model: config.geminiImageModel,
      // Some image models expect response modalities instead of mimeType.
      generationConfig: { responseModalities: ["IMAGE"] } as unknown as Record<
        string,
        unknown
      >,
    });
  }

  return cachedImageModel;
};

const extractImageData = (response: unknown) => {
  const responseAny = response as any;
  const parts =
    responseAny?.candidates?.[0]?.content?.parts ??
    responseAny?.content?.parts ??
    [];

  for (const part of parts) {
    const inlineData = part?.inlineData;
    if (inlineData?.data && inlineData?.mimeType) {
      return inlineData as { data: string; mimeType: string };
    }
  }

  return null;
};

export const generateImage = async (prompt: string) => {
  const safePrompt = prompt.trim().slice(0, 400);
  const encoded = encodeURIComponent(safePrompt);
  const fallback = safePrompt
    ? `https://placehold.co/1024x1024/png?text=${encoded}`
    : FALLBACK_IMAGE_URL;

  const model = getImageModel();
  if (!model || !safePrompt) {
    return { imageUrl: fallback };
  }

  try {
    const result = await model.generateContent(safePrompt);
    const image = extractImageData(result.response);
    if (image) {
      return { imageUrl: `data:${image.mimeType};base64,${image.data}` };
    }
  } catch (error) {
    console.warn("Gemini image generation failed, using fallback.", error);
  }

  return { imageUrl: fallback };
};
