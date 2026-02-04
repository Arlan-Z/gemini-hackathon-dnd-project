import { Router } from "express";
import { z } from "zod";
import {
  applyAiResponse,
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

    // Используем оркестратор вместо прямого вызова AI
    const orchestratorResponse = await processPlayerAction(state, action);

    // Обновляем историю
    pushHistoryEntry(state, { role: "user", parts: action });
    pushHistoryEntry(state, { role: "model", parts: orchestratorResponse.storyText });

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

    res.json({
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
        routing: orchestratorResponse.routing,
        isGameOver: orchestratorResponse.isGameOver,
        gameOverDescription: orchestratorResponse.gameOverDescription,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request payload", issues: error.issues });
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
    result: { success: boolean };
  }>
): Record<string, number> => {
  const updates: Record<string, number> = {};

  for (const call of toolCalls) {
    if (call.toolName === "update_player_stats" && call.result.success) {
      const args = call.args;
      if (typeof args.hp === "number") updates.hp = (updates.hp || 0) + args.hp;
      if (typeof args.sanity === "number") updates.sanity = (updates.sanity || 0) + args.sanity;
      if (typeof args.str === "number") updates.str = (updates.str || 0) + args.str;
      if (typeof args.int === "number") updates.int = (updates.int || 0) + args.int;
      if (typeof args.dex === "number") updates.dex = (updates.dex || 0) + args.dex;
    }
  }

  return updates;
};

export default router;
