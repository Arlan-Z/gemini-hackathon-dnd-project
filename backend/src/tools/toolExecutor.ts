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

export interface ExecutionContext {
  state: GameState;
  toolCalls: ToolCallLog[];
  imagePrompt: string | null;
  gameOverTriggered: boolean;
  gameOverDescription: string | null;
}

const clamp = (value: number, min: number, max: number) => 
  Math.max(min, Math.min(max, value));

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

  if (typeof args.strength === "number") {
    state.stats.strength += args.strength;
    changes.push(`Strength changed by ${args.strength}`);
  }

  if (typeof args.intelligence === "number") {
    state.stats.intelligence += args.intelligence;
    changes.push(`Intelligence changed by ${args.intelligence}`);
  }

  if (typeof args.dexterity === "number") {
    state.stats.dexterity += args.dexterity;
    changes.push(`Dexterity changed by ${args.dexterity}`);
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

export const executeInventoryAction = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;
  
  if (typeof args.action !== "string" || !args.action.trim()) {
    return {
      success: false,
      message: "Invalid or missing 'action' parameter. Must be a non-empty, non-whitespace string ('add' or 'remove').",
    };
  }
  
  const action = args.action.trim().toLowerCase();
  
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

export const executeAddTag = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;

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

export const executeRemoveTag = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const { state } = ctx;

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

export const executeTriggerGameOver = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const endingTypeValidation = validateNonEmptyString(args.endingType, "endingType");
  if (!endingTypeValidation.valid) {
    return {
      success: false,
      message: endingTypeValidation.error,
    };
  }

  const descValidation = validateNonEmptyString(args.deathDescription, "deathDescription");
  if (!descValidation.valid) {
    return {
      success: false,
      message: descValidation.error,
    };
  }

  const endingType = endingTypeValidation.trimmed;
  const deathDescription = descValidation.trimmed;

  ctx.state.isGameOver = true;
  ctx.gameOverTriggered = true;
  ctx.gameOverDescription = deathDescription;

  return {
    success: true,
    message: `GAME OVER triggered. Type: ${endingType}. The player's journey ends here.`,
    data: { endingType, deathDescription },
  };
};

export const executeGenerateSceneImage = (
  ctx: ExecutionContext,
  args: Record<string, unknown>
): ToolResult => {
  const style = (args.style as string) || "horror";

  const locationValidation = validateNonEmptyString(args.location, "location");
  if (!locationValidation.valid) {
    return {
      success: false,
      message: locationValidation.error,
    };
  }

  const location = locationValidation.trimmed;

  const materials = Array.isArray(args.materials) 
    ? (args.materials as string[]).filter(m => typeof m === "string" && m.trim())
    : [];
  
  if (materials.length === 0) {
    return {
      success: false,
      message: "Invalid or missing 'materials' parameter. Must be a non-empty array of strings.",
    };
  }

  const lightingValidation = validateNonEmptyString(args.lighting, "lighting");
  if (!lightingValidation.valid) {
    return {
      success: false,
      message: lightingValidation.error,
    };
  }
  const lighting = lightingValidation.trimmed;

  const atmosphereValidation = validateNonEmptyString(args.atmosphere, "atmosphere");
  if (!atmosphereValidation.valid) {
    return {
      success: false,
      message: atmosphereValidation.error,
    };
  }
  const atmosphere = atmosphereValidation.trimmed;

  const descValidation = validateNonEmptyString(args.visualDescription, "visualDescription");
  if (!descValidation.valid) {
    return {
      success: false,
      message: descValidation.error,
    };
  }

  const visualDescription = descValidation.trimmed;

  const previousEnvironment = ctx.state.environment;
  const previousLocation = ctx.state.currentLocation;

  ctx.state.environment = {
    location,
    materials,
    lighting,
    atmosphere,
  };
  ctx.state.currentLocation = location;

  if (!ctx.state.locationHistory) {
    ctx.state.locationHistory = [];
  }
  if (!ctx.state.locationHistory.includes(location)) {
    ctx.state.locationHistory.push(location);
  }

  let contextualPrompt = visualDescription;
  
  const materialsStr = materials.join(", ");
  const envDetails = `Materials: ${materialsStr}. Lighting: ${lighting}. Atmosphere: ${atmosphere}`;
  
  if (previousEnvironment && previousLocation === location) {
    const materialsSame = previousEnvironment.materials.some(m => materials.includes(m));
    if (materialsSame) {
      contextualPrompt = `Continuing in ${location} (${envDetails}): ${visualDescription}`;
    } else {
      contextualPrompt = `Still in ${location}, but environment changed (${envDetails}): ${visualDescription}`;
    }
  } else if (previousLocation && previousLocation !== location) {
    contextualPrompt = `Transitioning from ${previousLocation} to ${location} (${envDetails}): ${visualDescription}`;
  } else {
    contextualPrompt = `Starting location ${location} (${envDetails}): ${visualDescription}`;
  }

  ctx.imagePrompt = `${contextualPrompt}, ${style} style, cinematic lighting, detailed, atmospheric`;

  return {
    success: true,
    message: `Scene image queued for generation in "${location}" with materials [${materialsStr}], lighting: ${lighting}, atmosphere: ${atmosphere}`,
    data: { 
      imagePrompt: ctx.imagePrompt, 
      style,
      location,
      materials,
      lighting,
      atmosphere,
      previousLocation,
      previousEnvironment,
    },
  };
};

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

  ctx.toolCalls.push({
    toolName,
    args,
    result,
    timestamp: Date.now(),
  });

  return result;
};

export const createExecutionContext = (state: GameState): ExecutionContext => ({
  state,
  toolCalls: [],
  imagePrompt: null,
  gameOverTriggered: false,
  gameOverDescription: null,
});
