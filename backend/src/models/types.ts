export interface PlayerStats {
  hp: number;
  sanity: number;
  str: number;
  int: number;
  dex: number;
}

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
  location: string; // Название локации (например, "spaceship_corridor")
  materials: string[]; // Материалы окружения (metal, stone, organic, etc.)
  lighting: string; // Освещение (dim_red, bright_white, darkness, etc.)
  atmosphere: string; // Атмосфера (claustrophobic, vast, eerie, etc.)
}

export interface GameState {
  stats: PlayerStats;
  inventory: InventoryItem[];
  tags: string[];
  history: HistoryMessage[];
  isGameOver: boolean;
  turn: number;
  currentLocation?: string; // Текущая локация для связности изображений
  locationHistory?: string[]; // История локаций
  environment?: EnvironmentContext; // Детальный контекст окружения
}

export interface AIResponse {
  story_text: string;
  stat_updates: Partial<PlayerStats>;
  choices: string[];
  image_prompt: string;
}
