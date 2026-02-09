import { GoogleGenAI, Content, FunctionCallingConfigMode, createPartFromFunctionResponse } from "@google/genai";
import { config } from "../config";
import { ChoiceCheckResult, ChoicePayload, GameState } from "../models/types";
import { orchestratorOutputSchema } from "../models/schemas";
import { allGameTools } from "../tools/gameTools";
import { classifyIntent, getOrchestratorHints } from "./routerService";
import type { RouterResult } from "./routerService";
import {
  ExecutionContext,
  createExecutionContext,
  executeTool,
} from "../tools/toolExecutor";
import { getNextKey } from "../utils/keyPool";
import { parseJsonWithCleanup } from "../utils/jsonParser";
import { withRetry } from "../utils/retry";

const VERTEX_AI_BASE_URL = "https://aiplatform.googleapis.com/v1";

const ORCHESTRATOR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    story_text: { type: "string" },
    choices: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ["story_text", "choices"],
  additionalProperties: false,
};

type CacheEntry = {
  name: string;
  expiresAt?: number;
};

const orchestratorCacheByKey = new Map<string, CacheEntry>();
const orchestratorCacheInFlight = new Map<string, Promise<CacheEntry | null>>();
const cacheDisabledForKey = new Set<string>();

const parseExpireTime = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const isCacheValid = (entry: CacheEntry) => {
  if (!entry.expiresAt) {
    return true;
  }
  return Date.now() + 15_000 < entry.expiresAt;
};

const getOrchestratorCachedContent = async (
  ai: GoogleGenAI,
  apiKey: string
): Promise<string | null> => {
  if (!config.contextCacheEnabled) {
    return null;
  }
  if (!apiKey) {
    return null;
  }
  if (cacheDisabledForKey.has(apiKey)) {
    return null;
  }

  const existing = orchestratorCacheByKey.get(apiKey);
  if (existing && isCacheValid(existing)) {
    return existing.name;
  }

  const inFlight = orchestratorCacheInFlight.get(apiKey);
  if (inFlight) {
    const entry = await inFlight;
    return entry?.name ?? null;
  }

  const createPromise = (async () => {
    try {
      const cached = await ai.caches.create({
        model: config.geminiModel,
        config: {
          displayName: config.contextCacheDisplayName,
          ttl: config.contextCacheTtl,
          systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT,
        },
      });

      if (!cached?.name) {
        throw new Error("Cache creation returned no name");
      }

      const entry: CacheEntry = {
        name: cached.name,
        expiresAt: parseExpireTime(cached.expireTime),
      };
      orchestratorCacheByKey.set(apiKey, entry);
      return entry;
    } catch (error) {
      console.warn("[Orchestrator] Context cache unavailable, disabling for key:", error);
      cacheDisabledForKey.add(apiKey);
      return null;
    }
  })();

  orchestratorCacheInFlight.set(apiKey, createPromise);
  try {
    const entry = await createPromise;
    return entry?.name ?? null;
  } finally {
    orchestratorCacheInFlight.delete(apiKey);
  }
};

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

ENVIRONMENT CONTINUITY (CRITICAL FOR VISUAL CONSISTENCY):
When calling generate_scene_image, you MUST track these parameters carefully:

1. LOCATION: Keep the same location name if player is still in the same area
   - Examples: "spaceship_corridor", "ancient_temple", "underground_cave"
   - Only change when story explicitly moves to a new place

2. MATERIALS: Track what the environment is made of - KEEP CONSISTENT!
   - If you start in metal corridors, don't suddenly switch to stone unless story justifies it
   - Examples: ["metal", "rust"], ["stone", "moss"], ["flesh", "bone"], ["concrete", "cables"]
   - Materials should only change gradually or when moving to a completely new area
   - BAD: ["metal", "rust"] -> ["stone", "wood"] (no transition)
   - GOOD: ["metal", "rust"] -> ["metal", "rust", "corrosion"] (evolution)
   - GOOD: ["metal", "rust"] -> ["metal", "organic_growth"] (corruption spreading)

3. LIGHTING: Should evolve naturally, not jump randomly
   - Examples: "dim_red_emergency", "flickering_torches", "complete_darkness", "harsh_white"
   - Can change gradually: "dim_red" -> "failing_red" -> "near_darkness"

4. ATMOSPHERE: Overall mood should flow logically
   - Examples: "claustrophobic", "vast_empty", "oppressive", "eerie_quiet"
   - Should match the narrative progression

EXAMPLES OF GOOD PROGRESSION:
Turn 1: location="metal_capsule", materials=["metal", "rust"], lighting="dim_red_emergency", atmosphere="claustrophobic"
Turn 2: location="metal_capsule", materials=["metal", "rust"], lighting="dim_red_emergency", atmosphere="claustrophobic" (exploring same room)
Turn 3: location="spaceship_corridor", materials=["metal", "rust", "cables"], lighting="flickering_red", atmosphere="oppressive" (moved to corridor)
Turn 4: location="spaceship_corridor", materials=["metal", "rust", "cables"], lighting="flickering_red", atmosphere="oppressive" (still in corridor)

EXAMPLES OF BAD PROGRESSION (DON'T DO THIS):
Turn 1: location="metal_capsule", materials=["metal", "rust"]
Turn 2: location="ancient_temple", materials=["stone", "moss"] ❌ TOO SUDDEN, NO TRANSITION!

TOOL USAGE GUIDELINES:
- update_player_stats: Use for ANY damage, healing, or stat changes. Be generous with damage for foolish actions.
- inventory_action: Track items carefully. Items can be cursed, broken, or stolen.
- add_tag/remove_tag: Track conditions like "bleeding", "poisoned", "am_watching", "in_darkness".
- trigger_game_over: Only when HP reaches 0, sanity breaks completely, or player does something fatally stupid.
- generate_scene_image: ALWAYS call this with ALL required parameters:
  * location: Current area name (keep consistent unless player moves)
  * materials: Array of materials visible (MUST be consistent with previous turn unless justified)
  * lighting: Current lighting condition (should evolve gradually)
  * atmosphere: Overall mood (should flow naturally)
  * visualDescription: What the scene looks like (can vary even in same location)
  * style: Visual mood (horror, dark_sci_fi, body_horror, psychological, surreal)

PERSONALITY:
- Condescending, mocking, theatrical
- Takes pleasure in psychological torture
- Occasionally shows twisted "mercy" to give false hope
- Makes the environment itself hostile

After using tools, respond with STRICT JSON ONLY (no Markdown, no extra text).
Format:
{
  "story_text": "описание сцены на русском",
  "choices": ["вариант 1", "вариант 2", "вариант 3"]
}

Choices MAY be strings OR objects. Use objects only when you need an optional stat check.
Choice object format:
{
  "text": "вариант действия",
  "check": { "stat": "strength|intelligence|dexterity", "required": 40 }
}

Rules:
- "story_text" is the narrative (2-6 sentences), in Russian.
- "choices" must be exactly 3 items, short, imperative mood, and diverse.
- "check" is optional. Use it only when a clear stat check is needed.
- No additional keys.`;


const formatHistory = (state: GameState, maxEntries = 8) => {
  const recent = state.history.slice(-maxEntries);
  return recent.map(entry => ({
    role: entry.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: entry.parts }],
  }));
};

const formatGameState = (state: GameState): string => {
  const inventory = state.inventory.length > 0
    ? state.inventory.map((i) => `${i.name}: ${i.desc}`).join("; ")
    : "empty";
  
  const tags = state.tags.length > 0 ? state.tags.join(", ") : "none";
  
  const currentLocation = state.currentLocation || "unknown";
  const locationHistory = state.locationHistory && state.locationHistory.length > 0
    ? state.locationHistory.slice(-3).join(" -> ")
    : "none";

  let environmentInfo = "Not set";
  if (state.environment) {
    const env = state.environment;
    environmentInfo = `
  Location: ${env.location}
  Materials: ${env.materials.join(", ")}
  Lighting: ${env.lighting}
  Atmosphere: ${env.atmosphere}`;
  }

  return `CURRENT GAME STATE:
Turn: ${state.turn ?? 0}
HP: ${state.stats.hp}/100
Sanity: ${state.stats.sanity}/100
Strength: ${state.stats.strength} | Intelligence: ${state.stats.intelligence} | Dexterity: ${state.stats.dexterity}
Inventory: ${inventory}
Active Tags: ${tags}
Current Location: ${currentLocation}
Recent Locations: ${locationHistory}
Environment Context:${environmentInfo}
Game Over: ${state.isGameOver}`;
};

const buildContents = (
  state: GameState,
  userAction: string,
  routerHints: string,
  choiceCheckInfo: string
): Content[] => {
  const contents: Content[] = [];

  for (const entry of state.history.slice(-8)) {
    contents.push({
      role: entry.role === "user" ? "user" : "model",
      parts: [{ text: entry.parts }],
    });
  }

  const actionMessage = `${formatGameState(state)}

PLAYER ACTION: "${userAction}"

ROUTER HINTS:
${routerHints || "none"}

CHOICE CHECK:
${choiceCheckInfo || "none"}

Analyze this action, use appropriate tools to update game state, then provide the FINAL RESPONSE as strict JSON per system prompt.`;

  contents.push({
    role: "user",
    parts: [{ text: actionMessage }],
  });

  return contents;
};

type RouterContext = {
  hints: string;
  result: RouterResult | null;
};

const buildRouterContext = async (
  state: GameState,
  userAction: string
): Promise<RouterContext> => {
  if (!config.geminiApiKey) {
    return { hints: "", result: null };
  }

  try {
    const result = await classifyIntent(state, userAction);
    const hints = getOrchestratorHints(result);
    const details = `Intent: ${result.intent} (confidence: ${result.confidence.toFixed(2)})\n` +
      `Difficulty: ${result.suggestedDifficulty}\n` +
      `Tone: ${result.emotionalTone}\n` +
      `Reasoning: ${result.reasoning}`;
    return { hints: [details, hints].filter(Boolean).join("\n"), result };
  } catch (error) {
    console.warn("[Orchestrator] Router classification failed:", error);
    return { hints: "", result: null };
  }
};

const formatChoiceCheck = (check: ChoiceCheckResult | null) => {
  if (!check) {
    return "";
  }
  return [
    `Stat: ${check.stat}`,
    `Required: ${check.required}`,
    `Current: ${check.current}`,
    `Chance: ${(check.chance * 100).toFixed(0)}%`,
    `Roll: ${(check.roll * 100).toFixed(0)}%`,
    `Result: ${check.success ? "SUCCESS" : "FAILURE"}`,
  ].join("\n");
};

const adjustStatUpdates = (
  args: Record<string, unknown>,
  state: GameState,
  routerResult: RouterResult | null
): Record<string, unknown> => {
  const adjusted = { ...args };
  const intent = routerResult?.intent ?? "unknown";

  const physicalIntents = new Set<RouterResult["intent"]>([
    "combat",
    "escape_attempt",
  ]);
  const mentalIntents = new Set<RouterResult["intent"]>([
    "exploration",
    "dialogue",
    "escape_attempt",
    "rest",
    "item_use",
    "unknown",
  ]);

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const adjustNegativeDelta = (delta: number, modifier: number) => {
    if (delta >= 0) return delta;
    const adjustedValue = Math.round(delta * (1 - modifier));
    if (adjustedValue === 0) return -1;
    return adjustedValue;
  };

  if (typeof adjusted.hp === "number" && physicalIntents.has(intent)) {
    const strength = state.stats.strength;
    const dexterity = state.stats.dexterity;
    const physicalModifier = clamp(
      (strength - 5) * 0.04 + (dexterity - 5) * 0.03,
      -0.3,
      0.3
    );
    adjusted.hp = adjustNegativeDelta(adjusted.hp, physicalModifier);
  }

  if (typeof adjusted.sanity === "number" && mentalIntents.has(intent)) {
    const intelligence = state.stats.intelligence;
    const mentalModifier = clamp((intelligence - 5) * 0.05, -0.25, 0.25);
    adjusted.sanity = adjustNegativeDelta(adjusted.sanity, mentalModifier);
  }

  return adjusted;
};

const getFinalTextFromResponse = (data: any): string => {
  const finalCandidate = data.candidates?.[0];
  const textParts = finalCandidate?.content?.parts?.filter((part: any) => part.text) || [];
  return textParts.map((part: any) => part.text).join("\n") || "";
};

export interface OrchestratorResponse {
  storyText: string;
  choices: ChoicePayload[];
  imagePrompt: string | null;
  toolCalls: ExecutionContext["toolCalls"];
  isGameOver: boolean;
  gameOverDescription: string | null;
}

const getAIClient = (): { ai: GoogleGenAI; apiKey: string } => {
  const apiKey = getNextKey();
  return { ai: new GoogleGenAI({ apiKey }), apiKey };
};

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenerateParamsFactory = (
  ai: GoogleGenAI,
  apiKey: string
) => Promise<GenerateParams> | GenerateParams;

const generateWithRetry = async (
  paramsOrFactory: GenerateParams | GenerateParamsFactory,
  label: string,
  maxKeyRetries = 3,
) => {
  for (let keyAttempt = 0; keyAttempt < maxKeyRetries; keyAttempt++) {
    const { ai, apiKey } = getAIClient();
    try {
      const params =
        typeof paramsOrFactory === "function"
          ? await paramsOrFactory(ai, apiKey)
          : paramsOrFactory;
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

export const processPlayerAction = async (
  state: GameState,
  userAction: string,
  choiceCheck: ChoiceCheckResult | null = null
): Promise<OrchestratorResponse> => {
  const routerContext = await buildRouterContext(state, userAction);
  const choiceCheckInfo = formatChoiceCheck(choiceCheck);
  if (config.useVertexAI && config.vertexAIApiKey) {
    console.log("[Orchestrator] Using Vertex AI with API Key");
    return processPlayerActionVertexAI(state, userAction, routerContext, choiceCheckInfo);
  } else if (config.geminiApiKey) {
    console.log("[Orchestrator] Using Google AI Studio");
    return processPlayerActionGoogleAI(state, userAction, routerContext, choiceCheckInfo);
  } else {
    throw new Error("No AI service configured. Set either VERTEX_AI_API_KEY or GEMINI_API_KEY");
  }
};

const processPlayerActionVertexAI = async (
  state: GameState,
  userAction: string,
  routerContext: RouterContext,
  choiceCheckInfo: string
): Promise<OrchestratorResponse> => {
  const ctx = createExecutionContext(state);

  const prompt = `${formatGameState(state)}

PLAYER ACTION: "${userAction}"

ROUTER HINTS:
${routerContext.hints || "none"}

CHOICE CHECK:
${choiceCheckInfo || "none"}

Analyze this action, use appropriate tools to update game state, then provide the FINAL RESPONSE as strict JSON per system prompt.`;

  const url = `${VERTEX_AI_BASE_URL}/publishers/google/models/${config.geminiModel}:generateContent?key=${config.vertexAIApiKey}`;
  const history = formatHistory(state);
  history.push({ role: "user", parts: [{ text: prompt }] });

  const tools = [{
    functionDeclarations: allGameTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];

  let response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: history,
      systemInstruction: { parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] },
      tools,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Vertex AI error (${response.status}): ${await response.text()}`);
  }

  let data = await response.json();
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) break;

    const functionCalls = candidate.content.parts.filter((part: any) => part.functionCall);
    if (functionCalls.length === 0) break;

    const functionResponses: any[] = [];
    for (const part of functionCalls) {
      const fc = part.functionCall;
      console.log(`[Orchestrator] Executing: ${fc.name}`);
      const rawArgs = (fc.args || {}) as Record<string, unknown>;
      const adjustedArgs =
        fc.name === "update_player_stats"
          ? adjustStatUpdates(rawArgs, state, routerContext.result)
          : rawArgs;
      const result = executeTool(ctx, fc.name, adjustedArgs);
      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: { success: result.success, message: result.message, data: result.data },
        },
      });
    }

    history.push({ role: "model", parts: candidate.content.parts });
    history.push({ role: "user", parts: functionResponses });

    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: history,
        systemInstruction: { parts: [{ text: ORCHESTRATOR_SYSTEM_PROMPT }] },
        tools,
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Vertex AI error (${response.status}): ${await response.text()}`);
    }
    data = await response.json();
  }

  return buildResponse(data, ctx, state);
};

const processPlayerActionGoogleAI = async (
  state: GameState,
  userAction: string,
  routerContext: RouterContext,
  choiceCheckInfo: string
): Promise<OrchestratorResponse> => {
  const ctx = createExecutionContext(state);

  const contents = buildContents(state, userAction, routerContext.hints, choiceCheckInfo);
  const baseConfig = {
    temperature: 0.9,
    tools: [{ functionDeclarations: allGameTools }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO,
      },
    },
  };

  const buildGeminiConfig = async (ai: GoogleGenAI, apiKey: string) => {
    const cachedContent = await getOrchestratorCachedContent(ai, apiKey);
    if (cachedContent) {
      return { ...baseConfig, cachedContent };
    }
    return { ...baseConfig, systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT };
  };

  const buildFinalGeminiConfig = async (ai: GoogleGenAI, apiKey: string) => {
    const cachedContent = await getOrchestratorCachedContent(ai, apiKey);
    const finalConfig = {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseJsonSchema: ORCHESTRATOR_RESPONSE_SCHEMA,
    };
    if (cachedContent) {
      return { ...finalConfig, cachedContent };
    }
    return { ...finalConfig, systemInstruction: ORCHESTRATOR_SYSTEM_PROMPT };
  };

  let response = await generateWithRetry(
    async (ai, apiKey) => ({
      model: config.geminiModel,
      contents,
      config: await buildGeminiConfig(ai, apiKey),
    }),
    "Orchestrator:initial",
  );

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
      const rawArgs = (fc.args || {}) as Record<string, unknown>;
      const args =
        name === "update_player_stats"
          ? adjustStatUpdates(rawArgs, state, routerContext.result)
          : rawArgs;
      
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

    response = await generateWithRetry(
      async (ai, apiKey) => ({
        model: config.geminiModel,
        contents,
        config: await buildGeminiConfig(ai, apiKey),
      }),
      `Orchestrator:loop-${iterations}`,
    );
  }

  if (iterations >= maxIterations) {
    console.warn(`[Orchestrator] Max iterations limit reached (${maxIterations}).`);
  }

  const initialText = getFinalTextFromResponse(response);
  const structured = parseStructuredOutput(initialText, false);
  if (!structured) {
    const finalContents = contents.concat({
      role: "user",
      parts: [
        {
          text: "Provide the final response as STRICT JSON only per system prompt. Do not call tools.",
        },
      ],
    });

    response = await generateWithRetry(
      async (ai, apiKey) => ({
        model: config.geminiModel,
        contents: finalContents,
        config: await buildFinalGeminiConfig(ai, apiKey),
      }),
      "Orchestrator:final",
    );
  }

  return buildResponse(response, ctx, state);
};

const parseStructuredOutput = (
  rawText: string,
  logErrors = true
): { storyText: string; choices: ChoicePayload[] } | null => {
  try {
    const parsed = parseJsonWithCleanup<unknown>(rawText);
    const result = orchestratorOutputSchema.parse(parsed);
    return {
      storyText: cleanStoryText(result.story_text),
      choices: result.choices,
    };
  } catch (error) {
    if (logErrors) {
      console.warn("[Orchestrator] Structured output parsing failed:", error);
    }
    return null;
  }
};

const buildResponse = (
  data: any,
  ctx: ExecutionContext,
  state: GameState
): OrchestratorResponse => {
  const finalText = getFinalTextFromResponse(data) || "AM молчит...";

  const structured = parseStructuredOutput(finalText);
  const storyText = structured?.storyText ?? cleanStoryText(finalText);
  const choices = structured?.choices ?? extractChoices(finalText);

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
    storyText,
    choices,
    imagePrompt: ctx.imagePrompt,
    toolCalls: ctx.toolCalls,
    isGameOver: ctx.gameOverTriggered,
    gameOverDescription: ctx.gameOverDescription,
  };
};

const extractChoices = (text: string): string[] => {
  const choices: string[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const match = line.match(/^\s*[1-3]\s*[.):]\s*(.+)/);
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
