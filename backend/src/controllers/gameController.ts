import { Router } from "express";
import { z } from "zod";
import { generateStory } from "../services/aiService";
import {
  applyAiResponse,
  createSession,
  getSession,
  serializeState,
} from "../services/gameService";
import { generateImage } from "../services/imageService";
import { actionRequestSchema } from "../models/schemas";

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
      image_url: image.imageUrl,
      state: serializeState(state),
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

    const aiResponse = await generateStory(state, action);
    const { storyText, choices, imagePrompt } = applyAiResponse(
      state,
      aiResponse,
      action,
    );
    const image = await generateImage(imagePrompt);

    res.json({
      sessionId,
      story_text: storyText,
      stat_updates: aiResponse.stat_updates,
      choices,
      image_prompt: imagePrompt,
      image_url: image.imageUrl,
      state: serializeState(state),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request payload", issues: error.issues });
      return;
    }
    next(error);
  }
});

export default router;
