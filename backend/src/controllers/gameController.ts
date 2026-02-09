import { Router } from "express";
import { z } from "zod";
import {
  createSession,
  getSession,
  serializeState,
  pushHistoryEntry,
  deleteSession,
} from "../services/gameService";
import { generateImage } from "../services/imageService";
import { actionRequestSchema } from "../models/schemas";
import type { ChoiceCheckResult, ChoiceOption, ChoicePayload, GameState } from "../models/types";
import { processPlayerAction } from "../services/orchestratorService";

const router = Router();

router.post("/start", async (_req, res, next) => {
  try {
    const { sessionId, state, intro } = createSession();
    const image = await generateImage(intro.image_prompt);

    res.json({
      sessionId,
      story_text: intro.story_text,
      choices: intro.choices,
      image_prompt: intro.image_prompt,
      image_url: image?.imageUrl || null,
      state: serializeState(state),
      orchestration: {
        mode: "intro",
        toolCalls: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

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

    state.turn = (state.turn ?? 0) + 1;

    const choiceCheck = resolveChoiceCheck(state, action);

    const orchestratorResponse = await processPlayerAction(state, action, choiceCheck);

    let imageUrl: string | null = null;
    if (orchestratorResponse.imagePrompt) {
      try {
        const image = await generateImage(orchestratorResponse.imagePrompt);
        imageUrl = image?.imageUrl || null;
      } catch (imageError) {
        console.error("[GameController] Image generation failed:", imageError);
      }
    }

    const statUpdates = extractStatUpdates(orchestratorResponse.toolCalls);

    const responsePayload = {
      sessionId,
      story_text: orchestratorResponse.storyText,
      stat_updates: statUpdates,
      choices: orchestratorResponse.choices,
      image_prompt: orchestratorResponse.imagePrompt,
      image_url: imageUrl,
      state: serializeState(state),
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

    state.pendingChoices = normalizePendingChoices(orchestratorResponse.choices);

    pushHistoryEntry(state, { role: "user", parts: action });
    pushHistoryEntry(state, { role: "model", parts: orchestratorResponse.storyText });

    res.json(responsePayload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request payload", issues: error.issues });
      return;
    }
    const msg = String((error as Record<string, unknown>)?.message ?? "");
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({
        error: "Too many requests. AM is thinking... Try again in 30 seconds.",
        retryAfter: 30,
      });
      return;
    }
    console.error("[GameController] Error processing action:", error);
    next(error);
  }
});

const normalizePendingChoices = (choices: ChoicePayload[]): ChoiceOption[] => {
  return choices.map((choice) => {
    if (typeof choice === "string") {
      return { text: choice };
    }
    return {
      text: choice.text,
      type: choice.type,
      check: choice.check,
    };
  });
};

const resolveChoiceCheck = (
  state: GameState,
  action: string
): ChoiceCheckResult | null => {
  const pending = state.pendingChoices;
  if (!pending || pending.length === 0) {
    return null;
  }

  const normalizedAction = action.trim();
  const matched = pending.find(
    (choice) => choice.text.trim() === normalizedAction
  );
  const check = matched?.check;
  if (!check) {
    return null;
  }

  const current = state.stats[check.stat];
  const required = check.required;
  const rawChance = required > 0 ? current / required : 1;
  const chance = Math.max(0, Math.min(1, rawChance));
  const roll = Math.random();

  return {
    stat: check.stat,
    required,
    current,
    chance,
    roll,
    success: roll <= chance,
  };
};

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
      const source =
        call.result.appliedDelta && typeof call.result.appliedDelta === "object"
          ? call.result.appliedDelta
          : call.args;

      if (!source || typeof source !== "object") {
        continue;
      }

      const { hp, sanity, strength, intelligence, dexterity } = source as {
        hp?: unknown;
        sanity?: unknown;
        strength?: unknown;
        intelligence?: unknown;
        dexterity?: unknown;
      };

      if (typeof hp === "number") updates.hp = (updates.hp || 0) + hp;
      if (typeof sanity === "number") updates.sanity = (updates.sanity || 0) + sanity;
      if (typeof strength === "number") updates.strength = (updates.strength || 0) + strength;
      if (typeof intelligence === "number") {
        updates.intelligence = (updates.intelligence || 0) + intelligence;
      }
      if (typeof dexterity === "number") {
        updates.dexterity = (updates.dexterity || 0) + dexterity;
      }
    }
  }

  return updates;
};

router.post("/restart", async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (sessionId) {
      deleteSession(sessionId);
      console.log(`[GameController] Deleted session ${sessionId}`);
    }

    const { sessionId: newSessionId, state, intro } = createSession();
    const image = await generateImage(intro.image_prompt);

    console.log(`[GameController] Created new session ${newSessionId}`);

    res.json({
      sessionId: newSessionId,
      story_text: intro.story_text,
      choices: intro.choices,
      image_prompt: intro.image_prompt,
      image_url: image?.imageUrl || null,
      state: serializeState(state),
      orchestration: {
        mode: "restart",
        toolCalls: [],
      },
    });
  } catch (error) {
    console.error("[GameController] Error restarting game:", error);
    next(error);
  }
});

export default router;
