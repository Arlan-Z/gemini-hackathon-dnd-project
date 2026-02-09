import { z } from "zod";

export const playerStatsSchema = z
  .object({
    hp: z.number(),
    sanity: z.number(),
    strength: z.number(),
    intelligence: z.number(),
    dexterity: z.number(),
  })
  .strict();

export const statUpdatesSchema = z
  .object({
    hp: z.number().optional(),
    sanity: z.number().optional(),
    strength: z.number().optional(),
    intelligence: z.number().optional(),
    dexterity: z.number().optional(),
  })
  .strict();

export const aiResponseSchema = z
  .object({
    story_text: z.string().min(1),
    stat_updates: statUpdatesSchema,
    choices: z.array(z.string().min(1)).length(3),
    image_prompt: z.string().min(1),
  })
  .strict();

export const orchestratorOutputSchema = z
  .object({
    story_text: z.string().min(1),
    choices: z.array(z.string().min(1)).length(3),
  })
  .strict();

export const actionRequestSchema = z.object({
  sessionId: z.string().min(1),
  action: z.string().min(1),
});
