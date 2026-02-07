/**
 * Game Tools - Function Declarations for Gemini Function Calling
 * 
 * Gemini использует эти инструменты как "кнопки" для управления игровой логикой.
 * Вся детерминированная логика выполняется на сервере, а не галлюцинациями ИИ.
 */

import { FunctionDeclaration, Type } from "@google/genai";

// Tool: Обновление статов игрока
export const updatePlayerStatsTool: FunctionDeclaration = {
  name: "update_player_stats",
  description: `Updates player stats (HP, sanity, strength, intelligence, dexterity) based on in-game consequences.
Use this when:
- Player takes damage (hp negative)
- Player heals (hp positive)  
- Player experiences horror/stress (sanity negative)
- Player gains confidence (sanity positive)
- Physical/mental attributes change from events`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      hp: {
        type: Type.NUMBER,
        description: "HP change. Negative for damage, positive for healing. Range: -100 to +50",
      },
      sanity: {
        type: Type.NUMBER,
        description: "Sanity change. Negative for horror/stress, positive for calm. Range: -50 to +20",
      },
      str: {
        type: Type.NUMBER,
        description: "Strength change. Usually -2 to +2",
      },
      int: {
        type: Type.NUMBER,
        description: "Intelligence change. Usually -2 to +2",
      },
      dex: {
        type: Type.NUMBER,
        description: "Dexterity change. Usually -2 to +2",
      },
      reason: {
        type: Type.STRING,
        description: "Brief reason for the stat change (for logging)",
      },
    },
    required: ["reason"],
  },
};

// Tool: Управление инвентарем
export const inventoryActionTool: FunctionDeclaration = {
  name: "inventory_action",
  description: `Manages player inventory - add or remove items.
Use when:
- Player finds/picks up an item
- Player uses/consumes an item
- Player loses/drops an item
- Item is destroyed or taken away`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: "Action type: 'add' to give item, 'remove' to take item",
      },
      itemName: {
        type: Type.STRING,
        description: "Name of the item in Russian",
      },
      itemDescription: {
        type: Type.STRING,
        description: "Brief description of the item (only for 'add' action)",
      },
      reason: {
        type: Type.STRING,
        description: "Why this inventory change happened",
      },
    },
    required: ["action", "itemName", "reason"],
  },
};

// Tool: Добавление тегов состояния
export const addTagTool: FunctionDeclaration = {
  name: "add_tag",
  description: `Adds a narrative tag to track story state and player conditions.
Use for:
- Status effects (poisoned, bleeding, cursed)
- Story flags (met_survivor, found_secret)
- Location markers (in_darkness, underwater)
- Relationship states (am_angry, am_amused)`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      tag: {
        type: Type.STRING,
        description: "Tag name in snake_case (e.g., 'bleeding', 'has_weapon')",
      },
      reason: {
        type: Type.STRING,
        description: "Why this tag is being added",
      },
    },
    required: ["tag", "reason"],
  },
};

// Tool: Удаление тегов
export const removeTagTool: FunctionDeclaration = {
  name: "remove_tag",
  description: `Removes a narrative tag when condition ends.
Use when:
- Status effect wears off
- Story condition changes
- Player leaves location`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      tag: {
        type: Type.STRING,
        description: "Tag name to remove",
      },
      reason: {
        type: Type.STRING,
        description: "Why this tag is being removed",
      },
    },
    required: ["tag", "reason"],
  },
};

// Tool: Триггер Game Over
export const triggerGameOverTool: FunctionDeclaration = {
  name: "trigger_game_over",
  description: `Triggers game over state. Use ONLY when player should die or game should end.
Ending types:
- death_hp: Player HP reached 0
- death_sanity: Player went insane (sanity 0)
- death_suicide: Player killed themselves
- death_am: AM directly killed the player
- death_environment: Environmental death
- escape: Rare - player somehow escaped (almost impossible)`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      endingType: {
        type: Type.STRING,
        description: "Type of game ending: death_hp, death_sanity, death_suicide, death_am, death_environment, or escape",
      },
      deathDescription: {
        type: Type.STRING,
        description: "Dramatic description of how the player met their end",
      },
    },
    required: ["endingType", "deathDescription"],
  },
};

// Tool: Генерация изображения сцены
export const generateSceneImageTool: FunctionDeclaration = {
  name: "generate_scene_image",
  description: `Generates a visual representation of the current scene.
ALWAYS call this to create atmosphere. Describe the scene visually in English.
IMPORTANT: Track environment details (materials, lighting, atmosphere) to maintain visual continuity.
If player moves within the same area, keep similar environmental elements.
Only change environment dramatically when the story explicitly moves to a completely new place.`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      location: {
        type: Type.STRING,
        description: "Current location name (e.g., 'spaceship_corridor', 'ancient_temple', 'underground_cave'). Keep consistent unless player explicitly moves to a new area.",
      },
      materials: {
        type: Type.ARRAY,
        description: "Materials visible in the scene (e.g., ['metal', 'rust'], ['stone', 'moss'], ['flesh', 'bone']). Keep consistent within same location type.",
        items: {
          type: Type.STRING,
        },
      },
      lighting: {
        type: Type.STRING,
        description: "Lighting condition (e.g., 'dim_red_emergency', 'flickering_torches', 'complete_darkness', 'harsh_white'). Should change gradually, not suddenly.",
      },
      atmosphere: {
        type: Type.STRING,
        description: "Overall atmosphere (e.g., 'claustrophobic', 'vast_empty', 'oppressive', 'eerie_quiet'). Should evolve naturally with the story.",
      },
      visualDescription: {
        type: Type.STRING,
        description: "English description of the scene for image generation. Include: setting, key objects, mood. 1-3 sentences. Build upon previous environment if player hasn't moved far.",
      },
      style: {
        type: Type.STRING,
        description: "Visual style hint: horror, dark_sci_fi, body_horror, psychological, or surreal",
      },
    },
    required: ["location", "materials", "lighting", "atmosphere", "visualDescription"],
  },
};

// Все инструменты для экспорта
export const allGameTools: FunctionDeclaration[] = [
  updatePlayerStatsTool,
  inventoryActionTool,
  addTagTool,
  removeTagTool,
  triggerGameOverTool,
  generateSceneImageTool,
];
