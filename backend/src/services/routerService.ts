import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config";
import { GameState } from "../models/types";

export type IntentType = 
  | "exploration"
  | "combat"
  | "dialogue"
  | "item_use"
  | "self_harm"
  | "escape_attempt"
  | "rest"
  | "unknown";

export interface RouterResult {
  intent: IntentType;
  confidence: number;
  reasoning: string;
  suggestedDifficulty: "trivial" | "easy" | "medium" | "hard" | "deadly";
  emotionalTone: "neutral" | "aggressive" | "fearful" | "desperate" | "cunning";
}

const VERTEX_AI_BASE_URL = "https://aiplatform.googleapis.com/v1";

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

const ROUTER_SYSTEM_PROMPT = `You are an intent classifier for a horror RPG game. 
Analyze the player's action and classify it into one of these categories:

INTENT TYPES:
- exploration: Looking around, examining objects, moving to new areas
- combat: Attacking, fighting, using weapons aggressively
- dialogue: Talking, asking questions, interacting with entities
- item_use: Using an item from inventory
- self_harm: Actions that would hurt the player themselves (drinking poison, jumping off, etc.)
- escape_attempt: Trying to escape, run away, find exit
- rest: Resting, waiting, doing nothing active
- unknown: Cannot determine intent

DIFFICULTY ASSESSMENT:
- trivial: No risk, simple observation
- easy: Minor risk, simple action
- medium: Moderate risk, requires some skill
- hard: High risk, dangerous action
- deadly: Almost certain to cause severe harm or death

EMOTIONAL TONE:
- neutral: Calm, rational action
- aggressive: Angry, violent intent
- fearful: Scared, defensive action
- desperate: Last resort, panic
- cunning: Clever, strategic thinking

You must respond exclusively by calling the classify_intent tool with appropriate arguments. Do not output raw JSON or natural-language text directly.`;

const routerFunctionDeclaration = {
  name: "classify_intent",
  description: "Classifies the player's intent and provides analysis",
  parameters: {
    type: Type.OBJECT,
    properties: {
      intent: {
        type: Type.STRING,
        description: "The classified intent type",
      },
      confidence: {
        type: Type.NUMBER,
        description: "Confidence score from 0.0 to 1.0",
      },
      reasoning: {
        type: Type.STRING,
        description: "Brief explanation of why this intent was chosen",
      },
      suggestedDifficulty: {
        type: Type.STRING,
        description: "Suggested difficulty level for this action",
      },
      emotionalTone: {
        type: Type.STRING,
        description: "Detected emotional tone of the action",
      },
    },
    required: ["intent", "confidence", "reasoning", "suggestedDifficulty", "emotionalTone"],
  },
};

export const classifyIntent = async (
  state: GameState,
  userAction: string
): Promise<RouterResult> => {
  const contextInfo = `
Player Stats: HP=${state.stats.hp}, Sanity=${state.stats.sanity}
Inventory: ${state.inventory.map(i => i.name).join(", ") || "empty"}
Active Tags: ${state.tags.join(", ") || "none"}
Game Over: ${state.isGameOver}`;

  try {
    let candidate: any;

    if (config.useVertexAI && config.vertexAIApiKey) {
      const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${config.geminiModel}:generateContent?key=${config.vertexAIApiKey}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `${contextInfo}\n\nPlayer Action: "${userAction}"\n\nClassify this action.`,
            }],
          }],
          systemInstruction: { parts: [{ text: ROUTER_SYSTEM_PROMPT }] },
          tools: [{ functionDeclarations: [routerFunctionDeclaration] }],
          generationConfig: { temperature: 0.3 },
        }),
      });

      if (!response.ok) {
        throw new Error(`Vertex AI error (${response.status}): ${await response.text()}`);
      }

      const data = await response.json();
      candidate = data.candidates?.[0];
    } else if (config.geminiApiKey) {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: config.geminiModel,
        contents: [{
          role: "user",
          parts: [{
            text: `${contextInfo}\n\nPlayer Action: "${userAction}"\n\nClassify this action.`,
          }],
        }],
        config: {
          systemInstruction: ROUTER_SYSTEM_PROMPT,
          temperature: 0.3,
          tools: [{ functionDeclarations: [routerFunctionDeclaration] }],
        },
      });
      candidate = response.candidates?.[0];
    } else {
      throw new Error("No AI service configured");
    }

    const functionCall = candidate?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;

    if (functionCall?.args) {
      const args = functionCall.args as Record<string, unknown>;

      const isValidIntent = (value: unknown): value is IntentType => {
        const allowedIntents: IntentType[] = [
          "exploration",
          "combat",
          "dialogue",
          "item_use",
          "self_harm",
          "escape_attempt",
          "rest",
          "unknown",
        ];
        return typeof value === "string" && (allowedIntents as string[]).includes(value);
      };

      const isValidDifficulty = (
        value: unknown,
      ): value is RouterResult["suggestedDifficulty"] => {
        const allowedDifficulties = ["trivial", "easy", "medium", "hard", "deadly"] as const;
        return typeof value === "string" && (allowedDifficulties as readonly string[]).includes(value);
      };

      const isValidEmotionalTone = (
        value: unknown,
      ): value is RouterResult["emotionalTone"] => {
        const allowedTones = ["neutral", "aggressive", "fearful", "desperate", "cunning"] as const;
        return typeof value === "string" && (allowedTones as readonly string[]).includes(value);
      };

      const rawIntent = args.intent;
      const rawConfidence = args.confidence;
      const rawReasoning = args.reasoning;
      const rawDifficulty = args.suggestedDifficulty;
      const rawEmotionalTone = args.emotionalTone;

      const intent: IntentType = isValidIntent(rawIntent) ? rawIntent : "unknown";
      const confidence =
        typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
          ? Math.max(0, Math.min(1, rawConfidence))
          : 0.5;
      const reasoning = typeof rawReasoning === "string" ? rawReasoning : "";
      const suggestedDifficulty: RouterResult["suggestedDifficulty"] =
        isValidDifficulty(rawDifficulty) ? rawDifficulty : "medium";
      const emotionalTone: RouterResult["emotionalTone"] =
        isValidEmotionalTone(rawEmotionalTone) ? rawEmotionalTone : "neutral";

      return {
        intent,
        confidence,
        reasoning,
        suggestedDifficulty,
        emotionalTone,
      };
    }

    return {
      intent: "unknown",
      confidence: 0.5,
      reasoning: "Could not classify intent",
      suggestedDifficulty: "medium",
      emotionalTone: "neutral",
    };
  } catch (error) {
    console.error("[Router] Classification failed:", error);
    return {
      intent: "unknown",
      confidence: 0.3,
      reasoning: "Classification error",
      suggestedDifficulty: "medium",
      emotionalTone: "neutral",
    };
  }
};

export const getOrchestratorHints = (result: RouterResult): string => {
  const hints: string[] = [];

  switch (result.intent) {
    case "self_harm":
      hints.push("CRITICAL: Player is attempting self-harm. Apply severe consequences immediately.");
      hints.push("Use trigger_game_over if action is lethal.");
      break;
    case "combat":
      hints.push("Combat scenario. Calculate damage based on player stats and enemy strength.");
      hints.push("Consider player's Strength and Dexterity for combat effectiveness.");
      break;
    case "escape_attempt":
      hints.push("Player trying to escape. AM should mock this futile attempt.");
      hints.push("Make escape seem possible but ultimately fail.");
      break;
    case "exploration":
      hints.push("Exploration action. Describe environment in disturbing detail.");
      hints.push("Consider revealing hidden horrors or useful items.");
      break;
    case "dialogue":
      hints.push("Dialogue/interaction. AM can respond directly or through environment.");
      hints.push("Use psychological manipulation.");
      break;
  }

  switch (result.suggestedDifficulty) {
    case "deadly":
      hints.push("DEADLY action - high chance of severe damage or death.");
      break;
    case "hard":
      hints.push("Difficult action - expect significant negative consequences.");
      break;
    case "trivial":
      hints.push("Simple action - minimal consequences, focus on atmosphere.");
      break;
  }

  if (result.emotionalTone === "desperate") {
    hints.push("Player seems desperate - AM should exploit this weakness.");
  } else if (result.emotionalTone === "cunning") {
    hints.push("Player being clever - AM should acknowledge but counter.");
  }

  return hints.join("\n");
};
