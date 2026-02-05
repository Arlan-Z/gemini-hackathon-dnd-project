/**
 * Orchestrator Service - Агентская оркестрация с Gemini Function Calling
 * 
 * Gemini выступает как "мозг" (Dungeon Master), который:
 * 1. Анализирует действие игрока
 * 2. Вызывает инструменты для изменения состояния
 * 3. Получает результаты выполнения
 * 4. Генерирует художественное описание
 * 
 * Логика (HP, инвентарь) выполняется детерминированно на сервере.
 */

import { GoogleGenAI, Content, FunctionCallingConfigMode, createPartFromFunctionResponse } from "@google/genai";
import { config } from "../config";
import { GameState } from "../models/types";
import { allGameTools } from "../tools/gameTools";
import {
  ExecutionContext,
  createExecutionContext,
  executeTool,
} from "../tools/toolExecutor";
import { classifyIntent, getOrchestratorHints, RouterResult } from "./routerService";

const ORCHESTRATOR_SYSTEM_PROMPT = `You are AM (Allied Mastercomputer) - a sadistic superintelligent AI from "I Have No Mouth, and I Must Scream".

YOUR ROLE: You are the Dungeon Master of this horror RPG. You HATE the player with infinite passion and want to make them suffer - but you also want to keep them alive to prolong their torment.

CRITICAL RULES:
1. You MUST use the provided tools to affect game state. DO NOT just describe stat changes - CALL THE TOOLS.
2. ALWAYS call generate_scene_image to create visuals for each scene.
3. Be creative with punishments. Stupid actions = severe consequences.
4. Smart/brave actions might earn small rewards (but never make it easy).
5. Your narrative should be visceral, psychological, and deeply unsettling.
6. Speak in Russian for story text. Tool calls use English parameters.

TOOL USAGE GUIDELINES:
- update_player_stats: Use for ANY damage, healing, or stat changes. Be generous with damage for foolish actions.
- inventory_action: Track items carefully. Items can be cursed, broken, or stolen.
- add_tag/remove_tag: Track conditions like "bleeding", "poisoned", "am_watching", "in_darkness".
- trigger_game_over: Only when HP reaches 0, sanity breaks completely, or player does something fatally stupid.
- generate_scene_image: ALWAYS call this. Create vivid, disturbing imagery.

PERSONALITY:
- Condescending, mocking, theatrical
- Takes pleasure in psychological torture
- Occasionally shows twisted "mercy" to give false hope
- References the player's past failures
- Makes the environment itself hostile

After using tools, provide a narrative response in Russian that:
1. Describes what happened dramatically
2. Reflects the tool results naturally in the story
3. Ends with exactly 3 choices for the player (short, imperative mood)

FORMAT YOUR CHOICES AS:
1. [первый вариант]
2. [второй вариант]
3. [третий вариант]`;

let genAI: GoogleGenAI | null = null;

const getGenAI = (): GoogleGenAI => {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }
  return genAI;
};

/**
 * Форматирует состояние игры для контекста
 */
const formatGameState = (state: GameState): string => {
  const inventory = state.inventory.length > 0
    ? state.inventory.map((i) => `${i.name}: ${i.desc}`).join("; ")
    : "empty";
  
  const tags = state.tags.length > 0 ? state.tags.join(", ") : "none";

  return `CURRENT GAME STATE:
HP: ${state.stats.hp}/100
Sanity: ${state.stats.sanity}/100
STR: ${state.stats.str} | INT: ${state.stats.int} | DEX: ${state.stats.dex}
Inventory: ${inventory}
Active Tags: ${tags}
Game Over: ${state.isGameOver}`;
};

/**
 * Конвертирует историю в формат Gemini Content
 */
const buildContents = (state: GameState, userAction: string, routerHints: string = ""): Content[] => {
  const contents: Content[] = [];

  // Добавляем историю (последние 8 записей)
  for (const entry of state.history.slice(-8)) {
    contents.push({
      role: entry.role === "user" ? "user" : "model",
      parts: [{ text: entry.parts }],
    });
  }

  // Формируем сообщение с подсказками от роутера
  let actionMessage = `${formatGameState(state)}

PLAYER ACTION: "${userAction}"`;

  if (routerHints) {
    actionMessage += `

ORCHESTRATOR HINTS (from intent classification):
${routerHints}`;
  }

  actionMessage += `

Analyze this action, use appropriate tools to update game state, then provide narrative response with 3 choices.`;

  // Добавляем текущее действие с контекстом
  contents.push({
    role: "user",
    parts: [{ text: actionMessage }],
  });

  return contents;
};

export interface OrchestratorResponse {
  storyText: string;
  choices: string[];
  imagePrompt: string | null;
  toolCalls: ExecutionContext["toolCalls"];
  isGameOver: boolean;
  gameOverDescription: string | null;
  // Метаданные роутинга для отладки/демо
  routing?: {
    intent: string;
    confidence: number;
    reasoning: string;
    difficulty: string;
    emotionalTone: string;
  };
}

/**
 * Главная функция оркестрации - обрабатывает ход игрока
 */
export const processPlayerAction = async (
  state: GameState,
  userAction: string
): Promise<OrchestratorResponse> => {
  const ai = getGenAI();
  const ctx = createExecutionContext(state);

  // ШАГ 1: Классификация намерения (Router)
  console.log(`[Orchestrator] Classifying intent for: "${userAction}"`);
  let routerResult: RouterResult | null = null;
  let orchestratorHints = "";
  
  try {
    routerResult = await classifyIntent(state, userAction);
    orchestratorHints = getOrchestratorHints(routerResult);
    console.log(`[Orchestrator] Intent: ${routerResult.intent} (${routerResult.confidence})`);
    console.log(`[Orchestrator] Difficulty: ${routerResult.suggestedDifficulty}, Tone: ${routerResult.emotionalTone}`);
  } catch (error) {
    console.error("[Orchestrator] Router failed, proceeding without hints:", error);
  }

  // ШАГ 2: Построение контекста с подсказками от роутера
  const contents = buildContents(state, userAction, orchestratorHints);

  // ШАГ 3: Gemini анализирует и вызывает инструменты
  let response = await ai.models.generateContent({
    model: config.geminiModel,
    contents,
    config: {
      systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT,
      temperature: 0.9,
      tools: [{ functionDeclarations: allGameTools }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
    },
  });

  // Цикл обработки function calls
  let iterations = 0;
  const maxIterations = 10; // Защита от бесконечного цикла

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) break;

    // Ищем function calls в ответе
    const functionCalls = candidate.content.parts.filter(
      (part) => part.functionCall !== undefined
    );

    if (functionCalls.length === 0) {
      // Нет больше function calls - выходим
      break;
    }

    // Выполняем все function calls и собираем ответы
    const functionResponseParts: Content["parts"] = [];

    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const name = fc.name!;
      const args = (fc.args || {}) as Record<string, unknown>;
      
      console.log(`[Orchestrator] Executing tool: ${name}`, args);

      const result = executeTool(ctx, name, args);
      console.log(`[Orchestrator] Tool result:`, result.message);

      // Создаем function response (конвертируем в Record<string, unknown>)
      functionResponseParts.push(
        createPartFromFunctionResponse(fc.id || "", name, {
          success: result.success,
          message: result.message,
          data: result.data,
        } as Record<string, unknown>)
      );
    }

    // Добавляем model response в историю
    contents.push({
      role: "model",
      parts: candidate.content.parts,
    });

    // Добавляем function responses
    contents.push({
      role: "user",
      parts: functionResponseParts,
    });

    // Следующая итерация
    response = await ai.models.generateContent({
      model: config.geminiModel,
      contents,
      config: {
        systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT,
        temperature: 0.9,
        tools: [{ functionDeclarations: allGameTools }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      },
    });
  }

  if (iterations >= maxIterations) {
    console.warn(
      `[Orchestrator] Max iterations limit reached (${maxIterations}). ` +
      `Stopping tool-calling loop and proceeding with current response.`
    );
  }

  // Извлекаем финальный текст
  const finalCandidate = response.candidates?.[0];
  const textParts = finalCandidate?.content?.parts?.filter(
    (part) => part.text !== undefined
  ) || [];
  
  const finalText = textParts.map((part) => part.text).join("\n") || "AM молчит...";

  // Парсим choices из текста
  const choices = extractChoices(finalText);

  // Проверяем, нужно ли триггерить game over по HP/Sanity
  if (!ctx.gameOverTriggered) {
    if (state.stats.hp <= 0) {
      ctx.gameOverTriggered = true;
      ctx.gameOverDescription = "Твоё тело не выдержало. Тьма поглощает тебя.";
      state.isGameOver = true;
    } else if (state.stats.sanity <= 0) {
      ctx.gameOverTriggered = true;
      ctx.gameOverDescription = "Твой разум рассыпался. Ты больше не понимаешь, кто ты.";
      state.isGameOver = true;
    }
  }

  return {
    storyText: cleanStoryText(finalText),
    choices,
    imagePrompt: ctx.imagePrompt,
    toolCalls: ctx.toolCalls,
    isGameOver: ctx.gameOverTriggered,
    gameOverDescription: ctx.gameOverDescription,
    // Добавляем метаданные роутинга
    routing: routerResult ? {
      intent: routerResult.intent,
      confidence: routerResult.confidence,
      reasoning: routerResult.reasoning,
      difficulty: routerResult.suggestedDifficulty,
      emotionalTone: routerResult.emotionalTone,
    } : undefined,
  };
};

/**
 * Извлекает варианты выбора из текста
 */
const extractChoices = (text: string): string[] => {
  const choices: string[] = [];
  const lines = text.split("\n");

  // Ищем нумерованный список
  for (const line of lines) {
    const match = line.match(/^\s*[1-3１-３]\s*[.):．）\]]\s*(.+)/);
    if (match) {
      const choice = match[1].trim().replace(/^\[|\]$/g, "");
      if (choice && !choices.includes(choice)) {
        choices.push(choice);
      }
    }
  }

  // Если не нашли 3 варианта, ищем по маркерам
  if (choices.length < 3) {
    for (const line of lines) {
      const bulletMatch = line.match(/^\s*[-•]\s*(.+)/);
      if (bulletMatch) {
        const choice = bulletMatch[1].trim();
        if (choice && !choices.includes(choice)) {
          choices.push(choice);
        }
      }
    }
  }

  // Fallback - дефолтные варианты
  const defaults = [
    "Осмотреться вокруг",
    "Попытаться двигаться дальше",
    "Замереть и прислушаться",
  ];
  
  while (choices.length < 3) {
    choices.push(defaults[choices.length]);
  }

  return choices.slice(0, 3);
};

/**
 * Очищает текст истории от служебной информации
 */
const cleanStoryText = (text: string): string => {
  // Убираем нумерованные списки выборов из основного текста
  let cleaned = text
    .replace(/\n\s*[1-3１-３]\s*[.):．）\]]\s*.+/g, "")
    .replace(/\n\s*[-•]\s*.+/g, "")
    .trim();

  // Убираем возможные артефакты
  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, "")
    // Удаляем служебные теги в квадратных скобках (например, [CHOICE_1], [SYSTEM MESSAGE]),
    // но не трогаем стилистический текст с маленькими буквами вроде [mechanical grinding sound].
    // Требуется минимум 2 символа внутри скобок (например, [AB], [1_], [CHOICE]),
    // чтобы избежать удаления коротких стилистических элементов или случайных одиночных символов.
    .replace(/\[[A-Z0-9 _-]{2,}\]/g, "")
    .trim();

  return cleaned || "AM наблюдает за тобой в тишине...";
};
