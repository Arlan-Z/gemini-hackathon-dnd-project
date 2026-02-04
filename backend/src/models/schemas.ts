import { z } from "zod";

export const playerStatsSchema = z
  .object({
    hp: z.number(),
    sanity: z.number(),
    str: z.number(),
    int: z.number(),
    dex: z.number(),
  })
  .strict();

export const statUpdatesSchema = z
  .object({
    hp: z.number().optional(),
    sanity: z.number().optional(),
    str: z.number().optional(),
    int: z.number().optional(),
    dex: z.number().optional(),
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

export const actionRequestSchema = z.object({
  sessionId: z.string().min(1),
  action: z.string().min(1),
});
