/**
 * Vertex AI с API Key (без Service Account)
 * Использует прямые HTTP запросы к Vertex AI REST API
 */

import { config } from "../config";

const VERTEX_AI_BASE_URL = "https://aiplatform.googleapis.com/v1";

interface VertexAIMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface VertexAIRequest {
  contents: VertexAIMessage[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  tools?: any[];
}

/**
 * Генерация текста через Vertex AI с API Key
 */
export const generateContentVertexAI = async (
  model: string,
  request: VertexAIRequest
): Promise<any> => {
  const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${model}:generateContent?key=${config.vertexAIApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
  }

  return response.json();
};

/**
 * Streaming генерация (для будущего)
 */
export const streamGenerateContentVertexAI = async (
  model: string,
  request: VertexAIRequest
): Promise<ReadableStream> => {
  const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${model}:streamGenerateContent?key=${config.vertexAIApiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI API error (${response.status}): ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  return response.body;
};

/**
 * Генерация изображения через Vertex AI Imagen
 */
export const generateImageVertexAI = async (prompt: string): Promise<string | null> => {
  // Imagen использует другой endpoint
  const model = config.geminiImageModel || "imagen-3.0-generate-001";
  const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${model}:predict?key=${config.vertexAIApiKey}`;

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
      console.error(`[VertexAI] Image generation failed: ${errorText}`);
      return null;
    }

    const data = await response.json();
    
    // Imagen возвращает base64 в predictions[0].bytesBase64Encoded
    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    
    if (imageBase64) {
      return `data:image/png;base64,${imageBase64}`;
    }

    return null;
  } catch (error) {
    console.error("[VertexAI] Image generation error:", error);
    return null;
  }
};
