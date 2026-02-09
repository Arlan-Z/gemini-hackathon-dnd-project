export interface PlayerStats {
  hp: number;
  sanity: number;
  strength: number;
  intelligence: number;
  dexterity: number;
}

export type StatCheckType = "strength" | "intelligence" | "dexterity";

export interface ChoiceCheck {
  stat: StatCheckType;
  required: number;
}

export interface ChoiceCheckResult {
  stat: StatCheckType;
  required: number;
  current: number;
  chance: number;
  roll: number;
  success: boolean;
}

export interface ChoiceOption {
  text: string;
  type?: "action" | "aggressive" | "stealth";
  check?: ChoiceCheck;
}

export type ChoicePayload = string | ChoiceOption;

export interface InventoryItem {
  id: string;
  name: string;
  desc: string;
}

export interface HistoryMessage {
  role: "user" | "model";
  parts: string;
}

export interface EnvironmentContext {
  location: string;
  materials: string[];
  lighting: string;
  atmosphere: string;
}

export interface GameState {
  stats: PlayerStats;
  inventory: InventoryItem[];
  tags: string[];
  history: HistoryMessage[];
  isGameOver: boolean;
  turn: number;
  currentLocation?: string;
  locationHistory?: string[];
  environment?: EnvironmentContext;
  pendingChoices?: ChoiceOption[];
}

export interface AIResponse {
  story_text: string;
  stat_updates: Partial<PlayerStats>;
  choices: string[];
  image_prompt: string;
}
