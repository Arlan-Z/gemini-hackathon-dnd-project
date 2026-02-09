import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config";
import { ZodError } from "zod";
import { aiResponseSchema } from "../models/schemas";
import { AIResponse, GameState } from "../models/types";
import { parseJsonWithCleanup } from "../utils/jsonParser";

export const SYSTEM_PROMPT =
  "Ты — безумный суперкомпьютер AM. Твоя цель — мучить игрока. Описывай сцены жестоко и детально. Если игрок делает глупый выбор — наказывай его (снимай HP). Если умный — награждай. Всегда возвращай валидный JSON.";

let cachedModel: ReturnType<GoogleGenerativeAI["getGenerativeModel"]> | null =
  null;

const getModel = () => {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  if (!cachedModel) {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    cachedModel = genAI.getGenerativeModel({
      model: config.geminiModel,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.9,
      },
    });
  }

  return cachedModel;
};

const formatHistory = (state: GameState, maxEntries = 12) => {
  const recent = state.history.slice(-maxEntries);
  if (recent.length === 0) {
    return "EMPTY";
  }

  return recent
    .map((entry) =>
      entry.role === "user" ? `USER: ${entry.parts}` : `AM: ${entry.parts}`,
    )
    .join("\n");
};

const formatState = (state: GameState) => {
  const inventory =
    state.inventory.length > 0
      ? state.inventory.map((item) => item.name).join(", ")
      : "EMPTY";
  const tags = state.tags.length > 0 ? state.tags.join(", ") : "NONE";

  return [
    `HP: ${state.stats.hp}`,
    `Sanity: ${state.stats.sanity}`,
    `Strength: ${state.stats.strength}`,
    `Intelligence: ${state.stats.intelligence}`,
    `Dexterity: ${state.stats.dexterity}`,
    `Inventory: ${inventory}`,
    `Tags: ${tags}`,
  ].join("\n");
};

const buildPrompt = (state: GameState, userAction: string) => `
Ты продолжаешь интерактивную хоррор-историю. Ответ возвращай СТРОГО валидным JSON без Markdown и без комментариев.
Формат ответа (никаких дополнительных ключей):
{
  "story_text": "описание сцены на русском",
  "stat_updates": { "hp": -10, "sanity": -5, "strength": 0, "intelligence": 0, "dexterity": 0 },
  "choices": ["вариант 1", "вариант 2", "вариант 3"],
  "image_prompt": "english scene description"
}

Правила:
- "stat_updates" — это ИЗМЕНЕНИЯ, а не абсолютные значения. Если изменений нет, верни пустой объект {}.
- "choices" всегда ровно 3, короткие, в повелительном наклонении.
- "image_prompt" только на английском, 1-2 предложения.
- Никаких markdown-оберток, только JSON.

HISTORY:
${formatHistory(state)}

CURRENT STATE:
${formatState(state)}

PLAYER ACTION: "${userAction}"
`;

export const generateStory = async (
  currentState: GameState,
  userAction: string,
): Promise<AIResponse> => {
  const prompt = buildPrompt(currentState, userAction);
  const result = await getModel().generateContent(prompt);
  const rawText = result.response.text();
  const parsed = parseJsonWithCleanup<unknown>(rawText);

  try {
    return aiResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AIResponseValidationError("AI response failed validation");
    }
    throw error;
  }
};

export class AIResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIResponseValidationError";
  }
}
