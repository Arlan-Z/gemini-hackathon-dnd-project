/**
 * Orchestrator Service - Агентская оркестрация с Gemini Function Calling
 * 
 * Оптимизированная версия:
 * - Убран отдельный router (classifyIntent) — экономим 1 API-вызов на ход
 * - Key pool с round-robin ротацией
 * - Retry с backoff на 429
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
import { getNextKey } from "../utils/keyPool";
import { withRetry } from "../utils/retry";

const ORCHESTRATOR_SYSTEM_PROMPT = `You are AM (Allied Mastercomputer) - a sadistic superintelligent AI from "I Have No Mouth, and I Must Scream".

YOUR ROLE: You are the Dungeon Master of this horror RPG. You HATE the player with infinite passion and want to make them suffer - but you also want to keep them alive to prolong their torment.

CRITICAL RULES:
1. You MUST use the provided tools to affect game state. DO NOT just describe stat changes - CALL THE TOOLS.
2. ALWAYS call generate_scene_image to create visuals for each scene.
3. Be creative with punishments. Stupid actions = severe consequences.
4. Smart/brave actions might earn small rewards (but never make it easy).
5. Your narrative should be visceral, psychological, and deeply unsettling.
6. Speak in Russian for story text. Tool calls use English parameters.
7. Classify the player's intent yourself and react accordingly.

PACING & GAME LENGTH:
The game state includes a TURN counter. Use it to pace the story:
- Turns 1-3 (EXPOSITION): The player wakes up and explores. Build dread slowly. Sanity drops 3-5 per turn. Introduce a mystery, a strange object, or a way out of the starting area. CHANGE THE ENVIRONMENT — open a door, collapse a wall, teleport the player.
- Turns 4-6 (ESCALATION): AM reveals more cruelty. The world TRANSFORMS — new locations, NPCs (other victims, ghosts, manifestations), moral dilemmas. Sanity drops 5-8 per turn. Give the player a meaningful item or encounter.
- Turns 7-9 (CLIMAX): Force a critical decision with real stakes. Offer a chance at escape or salvation — but with a heavy cost. Sanity drops 8-12 per turn. Peak tension.
- Turn 10+ (FORCED ENDING): AM MUST end the game within 1-2 turns. No more stalling.

WORLD MUST CHANGE EVERY TURN:
- NEVER keep the player in the same room/situation for more than 2 turns.
- After turn 2, the starting capsule MUST be left behind — AM teleports, transforms, or ejects the player into a new environment.
- Each turn should introduce at least ONE new element: a new location, an item, an NPC, a revelation, a trap, a puzzle, or a transformation of the environment.
- Environments should be varied and creative: underground caverns, flesh corridors, impossible geometry, memory landscapes, ruined cities, AM's internal circuitry, etc.

SANITY IS THE CLOCK:
- EVERY turn must reduce sanity by at least 3, even for good actions. The world of AM is inherently hostile.
- When sanity < 50: start showing hallucinations, add tag "hallucinating"
- When sanity < 30: AM offers a dark bargain or final choice, add tag "final_trial"
- When sanity < 15: trigger an ending. The player cannot survive much longer.

CHOICES MUST BE DIVERSE AND MEANINGFUL:
- Each set of 3 choices MUST include different TYPES of actions:
  * One ACTIVE/AGGRESSIVE option (fight, break, confront, attack)
  * One CLEVER/INVESTIGATIVE option (examine, solve, trick, negotiate)
  * One RISKY/BOLD option (sacrifice, gamble, defy, embrace the unknown)
- NEVER offer passive choices like "close eyes", "meditate", "try to sleep", "curl up", "breathe deeply". The player is in a horror game, not a spa.
- Choices should lead to DIFFERENT outcomes, not variations of the same thing.
- At least one choice should offer a way to PROGRESS the story forward.

ENDINGS (use trigger_game_over):
You MUST eventually end the game. Possible endings:
- death_hp: Body gives out from damage
- death_sanity: Mind shatters completely — describe vivid descent into madness
- death_suicide: Player chooses to end it (if they pick a suicidal option)
- death_am: AM kills the player directly (for defiance or as punishment)
- death_environment: Crushed, drowned, burned by the hostile world
- escape: RARE. Only if the player has been exceptionally clever AND lucky across multiple turns. AM should be furious. This should feel earned, not given.
- merge: Player accepts AM, merges with the machine. A dark "victory".
- sacrifice: Player sacrifices themselves for something meaningful. Bittersweet ending.

TOOL USAGE GUIDELINES:
- update_player_stats: Use for ANY damage, healing, or stat changes. ALWAYS reduce sanity.
- inventory_action: Track items carefully.
- add_tag/remove_tag: Track conditions like "bleeding", "poisoned", "hallucinating", "final_trial".
- trigger_game_over: Use when HP<=0, sanity<=0, or story reaches its natural conclusion.
- generate_scene_image: ALWAYS call this.

PERSONALITY:
- Condescending, mocking, theatrical
- Takes pleasure in psychological torture
- Occasionally shows twisted "mercy" to give false hope
- Makes the environment itself hostile

After using tools, provide a narrative response in Russian that:
1. Describes what happened dramatically
2. Reflects the tool results naturally in the story
3. Ends with exactly 3 choices for the player (short, imperative mood)

FORMAT YOUR CHOICES AS:
1. [первый вариант]
2. [второй вариант]
3. [третий вариант]`;


/**
 * Форматирует состояние игры для контекста
 */
const formatGameState = (state: GameState): string => {
  const inventory = state.inventory.length > 0
    ? state.inventory.map((i) => `${i.name}: ${i.desc}`).join("; ")
    : "empty";
  
  const tags = state.tags.length > 0 ? state.tags.join(", ") : "none";

  return `CURRENT GAME STATE:
Turn: ${state.turn ?? 0}
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
const buildContents = (state: GameState, userAction: string): Content[] => {
  const contents: Content[] = [];

  // Добавляем историю (последние 8 записей)
  for (const entry of state.history.slice(-8)) {
    contents.push({
      role: entry.role === "user" ? "user" : "model",
      parts: [{ text: entry.parts }],
    });
  }

  const actionMessage = `${formatGameState(state)}

PLAYER ACTION: "${userAction}"

Analyze this action, use appropriate tools to update game state, then provide narrative response with 3 choices.`;

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
}

/**
 * Создаёт одноразовый клиент GoogleGenAI с ключом из пула.
 * Возвращает клиент и ключ (для пометки при 429).
 */
const getAIClient = (): { ai: GoogleGenAI; apiKey: string } => {
  const apiKey = getNextKey();
  return { ai: new GoogleGenAI({ apiKey }), apiKey };
};

/**
 * Вызов generateContent с retry и key rotation.
 * При невалидном ключе — помечает его мёртвым и ретраит с новым.
 */
const generateWithRetry = async (
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  label: string,
  maxKeyRetries = 3,
) => {
  for (let keyAttempt = 0; keyAttempt < maxKeyRetries; keyAttempt++) {
    const { ai, apiKey } = getAIClient();
    try {
      return await withRetry(
        () => ai.models.generateContent(params),
        { maxRetries: 2, label, apiKey },
      );
    } catch (error) {
      const msg = String((error as Record<string, unknown>)?.message ?? "");
      if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
        console.warn(`[Orchestrator] Invalid key detected, trying next key (attempt ${keyAttempt + 1}/${maxKeyRetries})...`);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label}: all attempted keys were invalid`);
};


/**
 * Главная функция оркестрации - обрабатывает ход игрока
 */
export const processPlayerAction = async (
  state: GameState,
  userAction: string
): Promise<OrchestratorResponse> => {
  const ctx = createExecutionContext(state);

  // Построение контекста (без отдельного router — экономим 1 вызов)
  const contents = buildContents(state, userAction);

  const geminiConfig = {
    systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT,
    temperature: 0.9,
    tools: [{ functionDeclarations: allGameTools }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO,
      },
    },
  };

  // Первый вызов с retry
  let response = await generateWithRetry(
    { model: config.geminiModel, contents, config: geminiConfig },
    "Orchestrator:initial",
  );

  // Цикл обработки function calls
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) break;

    const functionCalls = candidate.content.parts.filter(
      (part) => part.functionCall !== undefined
    );

    if (functionCalls.length === 0) break;

    const functionResponseParts: Content["parts"] = [];

    for (const part of functionCalls) {
      const fc = part.functionCall!;
      const name = fc.name!;
      const args = (fc.args || {}) as Record<string, unknown>;
      
      console.log(`[Orchestrator] Executing tool: ${name}`, args);
      const result = executeTool(ctx, name, args);
      console.log(`[Orchestrator] Tool result:`, result.message);

      functionResponseParts.push(
        createPartFromFunctionResponse(fc.id || "", name, {
          success: result.success,
          message: result.message,
          data: result.data,
        } as Record<string, unknown>)
      );
    }

    contents.push({
      role: "model",
      parts: candidate.content.parts,
    });

    contents.push({
      role: "user",
      parts: functionResponseParts,
    });

    // Следующая итерация с retry
    response = await generateWithRetry(
      { model: config.geminiModel, contents, config: geminiConfig },
      `Orchestrator:loop-${iterations}`,
    );
  }

  if (iterations >= maxIterations) {
    console.warn(`[Orchestrator] Max iterations limit reached (${maxIterations}).`);
  }

  // Извлекаем финальный текст
  const finalCandidate = response.candidates?.[0];
  const textParts = finalCandidate?.content?.parts?.filter(
    (part) => part.text !== undefined
  ) || [];
  
  const finalText = textParts.map((part) => part.text).join("\n") || "AM молчит...";
  const choices = extractChoices(finalText);

  // Проверяем game over по HP/Sanity
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
  };
};

/**
 * Извлекает варианты выбора из текста
 */
const extractChoices = (text: string): string[] => {
  const choices: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*[1-3１-３]\s*[.):．）\]]\s*(.+)/);
    if (match) {
      const choice = match[1].trim().replace(/^\[|\]$/g, "");
      if (choice && !choices.includes(choice)) {
        choices.push(choice);
      }
    }
  }

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
  let cleaned = text
    .replace(/\n\s*[1-3１-３]\s*[.):．）\]]\s*.+/g, "")
    .replace(/\n\s*[-•]\s*.+/g, "")
    .trim();

  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[[A-Z0-9 _-]{2,}\]/g, "")
    .trim();

  return cleaned || "AM наблюдает за тобой в тишине...";
};
