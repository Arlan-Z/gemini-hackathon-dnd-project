/**
 * Tool Executor - Выполняет вызовы функций от Gemini
 * 
 * Это "руки" оркестратора. Gemini решает ЧТО делать,
 * а этот модуль выполняет действия детерминированно.
 */

import { v4 as uuidv4 } from "uuid";
import { GameState, InventoryItem } from "../models/types";

export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface ToolCallLog {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResult;
  timestamp: number;
}

// Контекст выполнения инструментов для одного хода
export interface ExecutionContext {
  state: GameState;
  toolCalls: ToolCallLog[];
  imagePrompt: string | null;
  gameOverTriggered: boolean;
  gameOverDescription: string | null;
}

const clamp = (value: number, min: number, max: number) => 
  Math.max(min, Math.min(max, value));

/**
 * Validates that a value is a non-empty, non-whitespace string
 */
const validateNonEmptyString = (
  value: unknown,
  paramName: string
): { valid: false; error: string } | { valid: true; trimmed: string } => {
  if (typeof value !== "string" || !value.trim()) {
    return {
      valid: false,
      error: `Invalid or missing '${paramName}' parameter. Must be a non-empty, non-whitespace string.`,
    };
  }
  return { valid: true, trimmed: value.trim() };
};

/**
 * Выполняет update_player_stats
 */
export const executeUpdatePlayerStats = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;
  const changes: string[] = [];

  if (typeof args.hp === "number") {
    const oldHp = state.stats.hp;
    state.stats.hp = clamp(state.stats.hp + args.hp, 0, 100);
    changes.push(`HP: ${oldHp} -> ${state.stats.hp}`);
  }

  if (typeof args.sanity === "number") {
    const oldSanity = state.stats.sanity;
    state.stats.sanity = clamp(state.stats.sanity + args.sanity, 0, 100);
    changes.push(`Sanity: ${oldSanity} -> ${state.stats.sanity}`);
  }

  if (typeof args.str === "number") {
    state.stats.str += args.str;
    changes.push(`STR changed by ${args.str}`);
  }

  if (typeof args.int === "number") {
    state.stats.int += args.int;
    changes.push(`INT changed by ${args.int}`);
  }

  if (typeof args.dex === "number") {
    state.stats.dex += args.dex;
    changes.push(`DEX changed by ${args.dex}`);
  }

  const reason = args.reason as string || "unknown";

  return {
    success: true,
    message: `Stats updated (${reason}): ${changes.join(", ")}. Current HP: ${state.stats.hp}, Sanity: ${state.stats.sanity}`,
    data: { 
      currentStats: { ...state.stats },
      changes,
    },
  };
};

/**
 * Выполняет inventory_action
 */
export const executeInventoryAction = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;
  
  // Validate required 'action' parameter
  if (typeof args.action !== "string" || !args.action.trim()) {
    return {
      success: false,
      message: "Invalid or missing 'action' parameter. Must be a non-empty, non-whitespace string ('add' or 'remove').",
    };
  }
  
  const action = args.action.trim().toLowerCase();
  
  // Validate required 'itemName' parameter
  if (typeof args.itemName !== "string" || !args.itemName.trim()) {
    return {
      success: false,
      message: "Invalid or missing 'itemName' parameter. Must be a non-empty, non-whitespace string.",
    };
  }
  
  const itemName = args.itemName.trim();
  const reason = args.reason as string || "unknown";

  if (action === "add") {
    const newItem: InventoryItem = {
      id: uuidv4(),
      name: itemName,
      desc: (args.itemDescription as string) || "",
    };
    state.inventory.push(newItem);

    return {
      success: true,
      message: `Item "${itemName}" added to inventory. Reason: ${reason}. Total items: ${state.inventory.length}`,
      data: { item: newItem, inventorySize: state.inventory.length },
    };
  }

  if (action === "remove") {
    const index = state.inventory.findIndex(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    if (index === -1) {
      return {
        success: false,
        message: `Item "${itemName}" not found in inventory. Cannot remove.`,
        data: { inventory: state.inventory.map((i) => i.name) },
      };
    }

    const removed = state.inventory.splice(index, 1)[0];
    return {
      success: true,
      message: `Item "${removed.name}" removed from inventory. Reason: ${reason}`,
      data: { removedItem: removed, inventorySize: state.inventory.length },
    };
  }

  return {
    success: false,
    message: `Unknown inventory action: ${action}. Valid actions are 'add' or 'remove'.`,
  };
};

/**
 * Выполняет add_tag
 */
export const executeAddTag = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;

  // Validate required 'tag' parameter
  const tagValidation = validateNonEmptyString(args.tag, "tag");
  if (!tagValidation.valid) {
    return {
      success: false,
      message: tagValidation.error,
    };
  }

  const tag = tagValidation.trimmed;
  const reason = (args.reason as string) || "unknown";

  if (state.tags.includes(tag)) {
    return {
      success: true,
      message: `Tag "${tag}" already exists. No change needed.`,
      data: { tags: state.tags },
    };
  }

  state.tags.push(tag);

  return {
    success: true,
    message: `Tag "${tag}" added. Reason: ${reason}. Active tags: ${state.tags.join(", ")}`,
    data: { tags: state.tags },
  };
};

/**
 * Выполняет remove_tag
 */
export const executeRemoveTag = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;

  // Validate required 'tag' parameter
  const tagValidation = validateNonEmptyString(args.tag, "tag");
  if (!tagValidation.valid) {
    return {
      success: false,
      message: tagValidation.error,
    };
  }

  const tag = tagValidation.trimmed;
  const reason = (args.reason as string) || "unknown";

  const index = state.tags.indexOf(tag);
  if (index === -1) {
    return {
      success: false,
      message: `Tag "${tag}" not found. Cannot remove.`,
      data: { tags: state.tags },
    };
  }

  state.tags.splice(index, 1);

  return {
    success: true,
    message: `Tag "${tag}" removed. Reason: ${reason}. Active tags: ${state.tags.join(", ") || "none"}`,
    data: { tags: state.tags },
  };
};

/**
 * Выполняет trigger_game_over
 */
export const executeTriggerGameOver = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const rawEndingType = args.endingType;
  const rawDeathDescription = args.deathDescription;

  if (
    typeof rawEndingType !== "string" ||
    rawEndingType.trim() === "" ||
    typeof rawDeathDescription !== "string" ||
    rawDeathDescription.trim() === ""
  ) {
    return {
      success: false,
      message:
        "Invalid arguments for trigger_game_over: endingType and deathDescription must be non-empty strings.",
    };
  }

  const endingType = rawEndingType.trim();
  const deathDescription = rawDeathDescription.trim();

  ctx.state.isGameOver = true;
  ctx.gameOverTriggered = true;
  ctx.gameOverDescription = deathDescription;

  return {
    success: true,
    message: `GAME OVER triggered. Type: ${endingType}. The player's journey ends here.`,
    data: { endingType, deathDescription },
  };
};

/**
 * Выполняет generate_scene_image
 */
export const executeGenerateSceneImage = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const visualDescription = args.visualDescription;
  const style = (args.style as string) || "horror";

  // Validate visualDescription parameter
  if (typeof visualDescription !== "string" || visualDescription.trim().length === 0) {
    return {
      success: false,
      message: "visualDescription must be a non-empty string to generate a scene image.",
      data: { visualDescription },
    };
  }

  // Сохраняем промпт для последующей генерации
  ctx.imagePrompt = `${visualDescription}, ${style} style, cinematic lighting, detailed`;

  return {
    success: true,
    message: `Scene image queued for generation: "${visualDescription}"`,
    data: { imagePrompt: ctx.imagePrompt, style },
  };
};

/**
 * Главный диспетчер инструментов
 */
export const executeTool = (
  ctx: ExecutionContext,
  toolName: string,
  args: Record<string, unknown>
): ToolResult => {
  let result: ToolResult;

  switch (toolName) {
    case "update_player_stats":
      result = executeUpdatePlayerStats(ctx, args);
      break;
    case "inventory_action":
      result = executeInventoryAction(ctx, args);
      break;
    case "add_tag":
      result = executeAddTag(ctx, args);
      break;
    case "remove_tag":
      result = executeRemoveTag(ctx, args);
      break;
    case "trigger_game_over":
      result = executeTriggerGameOver(ctx, args);
      break;
    case "generate_scene_image":
      result = executeGenerateSceneImage(ctx, args);
      break;
    default:
      result = {
        success: false,
        message: `Unknown tool: ${toolName}`,
      };
  }

  // Логируем вызов
  ctx.toolCalls.push({
    toolName,
    args,
    result,
    timestamp: Date.now(),
  });

  return result;
};

/**
 * Создает новый контекст выполнения
 */
export const createExecutionContext = (state: GameState): ExecutionContext => ({
  state,
  toolCalls: [],
  imagePrompt: null,
  gameOverTriggered: false,
  gameOverDescription: null,
});
