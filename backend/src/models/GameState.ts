export interface PlayerStats {
  hp: number;
  sanity: number; // Рассудок
  strength: number;
  intelligence: number;
  agility: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  imagePrompt?: string;
}

export interface GameState {
  sessionId: string;
  stats: PlayerStats;
  inventory: InventoryItem[];
  tags: string[]; // ['bleeding', 'fear']
  history: Array<{ role: 'user' | 'model'; parts: string }>; // История чата для контекста
  lastImagePrompt: string;
  isGameOver: boolean;
}

// Ответ от Gemini должен строго соответствовать этому интерфейсу
export interface AIResponse {
  narrative: string; // Сюжетный текст
  choices: Array<{ text: string; type: 'action' | 'item_use' }>;
  statUpdates: Partial<PlayerStats>; // Изменения статов, например { hp: -10 }
  tagsAdded: string[];
  tagsRemoved: string[];
  imagePrompt: string;
  itemReceived?: InventoryItem; // Если игрок нашел предмет
}