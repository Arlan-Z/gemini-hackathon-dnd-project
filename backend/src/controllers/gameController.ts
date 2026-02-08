import { Router } from "express";
import { z } from "zod";
import {
  createSession,
  getSession,
  serializeState,
  pushHistoryEntry,
} from "../services/gameService";
import { generateImage } from "../services/imageService";
import { actionRequestSchema } from "../models/schemas";
import { processPlayerAction } from "../services/orchestratorService";

const router = Router();

/**
 * POST /start - Начать новую игру
 */
router.post("/start", async (_req, res, next) => {
  try {
    const { sessionId, state, intro } = createSession();
    const image = await generateImage(intro.image_prompt);

    res.json({
      sessionId,
      story_text: intro.story_text,
      choices: intro.choices,
      image_prompt: intro.image_prompt,
      image_url: image.imageUrl,
      state: serializeState(state),
      // Метаданные оркестрации (для отладки/демо)
      orchestration: {
        mode: "intro",
        toolCalls: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /action - Обработать действие игрока через оркестратор
 */
router.post("/action", async (req, res, next) => {
  try {
    const { sessionId, action } = actionRequestSchema.parse(req.body);
    const state = getSession(sessionId);

    if (!state) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (state.isGameOver) {
      res.status(409).json({
        error: "Game is already over",
        state: serializeState(state),
      });
      return;
    }

    console.log(`[GameController] Processing action for session ${sessionId}: "${action}"`);

    // Инкрементируем счётчик ходов
    state.turn = (state.turn ?? 0) + 1;

    // Используем оркестратор вместо прямого вызова AI
    const orchestratorResponse = await processPlayerAction(state, action);

    // Генерируем изображение если есть промпт
    let imageUrl: string | null = null;
    if (orchestratorResponse.imagePrompt) {
      try {
        const image = await generateImage(orchestratorResponse.imagePrompt);
        imageUrl = image.imageUrl;
      } catch (imageError) {
        console.error("[GameController] Image generation failed:", imageError);
      }
    }

    // Формируем stat_updates из tool calls для совместимости с фронтендом
    const statUpdates = extractStatUpdates(orchestratorResponse.toolCalls);

    // Prepare response object before updating history
    const responsePayload = {
      sessionId,
      story_text: orchestratorResponse.storyText,
      stat_updates: statUpdates,
      choices: orchestratorResponse.choices,
      image_prompt: orchestratorResponse.imagePrompt,
      image_url: imageUrl,
      state: serializeState(state),
      // Метаданные оркестрации (для отладки/демо)
      orchestration: {
        mode: "function_calling",
        toolCalls: orchestratorResponse.toolCalls.map((tc) => ({
          tool: tc.toolName,
          args: tc.args,
          success: tc.result.success,
          message: tc.result.message,
        })),
        isGameOver: orchestratorResponse.isGameOver,
        gameOverDescription: orchestratorResponse.gameOverDescription,
      },
    };

    // Only update history after successfully preparing the response
    pushHistoryEntry(state, { role: "user", parts: action });
    pushHistoryEntry(state, { role: "model", parts: orchestratorResponse.storyText });

    res.json(responsePayload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request payload", issues: error.issues });
      return;
    }
    // Return 429 to client instead of 500 on rate limit
    const msg = String((error as Record<string, unknown>)?.message ?? "");
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({
        error: "Слишком много запросов. AM задумался... Попробуй через 30 секунд.",
        retryAfter: 30,
      });
      return;
    }
    console.error("[GameController] Error processing action:", error);
    next(error);
  }
});

/**
 * Извлекает изменения статов из логов вызовов инструментов
 */
const extractStatUpdates = (
  toolCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result: { success: boolean; appliedDelta?: Record<string, unknown> };
  }>
): Record<string, number> => {
  const updates: Record<string, number> = {};

  for (const call of toolCalls) {
    if (call.toolName === "update_player_stats" && call.result.success) {
      // Prefer the normalized appliedDelta from the tool result; fall back to raw args
      // if appliedDelta is missing or not an object. This defends against partially
      // malformed tool responses while still surfacing best-effort stat changes.
      const source =
        call.result.appliedDelta && typeof call.result.appliedDelta === "object"
          ? call.result.appliedDelta
          : call.args;

      if (!source || typeof source !== "object") {
        // Skip this call if we cannot safely read stat fields from the source.
        continue;
      }

      const { hp, sanity, str, int, dex } = source as {
        hp?: unknown;
        sanity?: unknown;
        str?: unknown;
        int?: unknown;
        dex?: unknown;
      };

      if (typeof hp === "number") updates.hp = (updates.hp || 0) + hp;
      if (typeof sanity === "number") updates.sanity = (updates.sanity || 0) + sanity;
      if (typeof str === "number") updates.str = (updates.str || 0) + str;
      if (typeof int === "number") updates.int = (updates.int || 0) + int;
      if (typeof dex === "number") updates.dex = (updates.dex || 0) + dex;
    }
  }

  return updates;
};

export default router;
