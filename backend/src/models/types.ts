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

export interface GameState {
  stats: PlayerStats;
  inventory: InventoryItem[];
  tags: string[];
  history: HistoryMessage[];
  isGameOver: boolean;
  turn: number;
}

export interface AIResponse {
  story_text: string;
  stat_updates: Partial<PlayerStats>;
  choices: string[];
  image_prompt: string;
}
