import { v4 as uuidv4 } from "uuid";
import { AIResponse, GameState, PlayerStats } from "../models/types";

export const INTRO_TEXT =
  "Ты приходишь в себя в холодной металлической капсуле. Воздух густой, пахнет озоном и ржавчиной. Вдалеке слышен скрежет — будто кто-то медленно грызет сталь. Голос, гладкий и бесчеловечный, звучит прямо в твоей голове: «Проснись. Я приготовил тебе новые муки».";

export const INTRO_IMAGE_PROMPT =
  "A claustrophobic metal chamber, dim red emergency lights, cables and rusted panels, eerie atmosphere, cinematic horror lighting.";

export const INTRO_CHOICES = [
  "Ощупать стены капсулы в поисках выхода",
  "Прокричать в пустоту и потребовать объяснений",
  "Сесть и попытаться успокоить дыхание",
];

const DEATH_TEXT =
  "Тьма смыкается. Ты чувствуешь, как тело обмякает, а разум гаснет. AM смеется, и этот смех — последнее, что ты слышишь.";

const DEFAULT_STATS: PlayerStats = {
  hp: 100,
  sanity: 100,
  str: 5,
  int: 5,
  dex: 5,
};

const sessions = new Map<string, GameState>();

export const createSession = () => {
  const sessionId = uuidv4();
  const state: GameState = {
    stats: { ...DEFAULT_STATS },
    inventory: [],
    tags: [],
    history: [{ role: "model", parts: INTRO_TEXT }],
    isGameOver: false,
  };

  sessions.set(sessionId, state);

  return {
    sessionId,
    state,
    intro: {
      story_text: INTRO_TEXT,
      choices: INTRO_CHOICES,
      image_prompt: INTRO_IMAGE_PROMPT,
    },
  };
};

export const getSession = (sessionId: string) => sessions.get(sessionId);

export const deleteSession = (sessionId: string) => sessions.delete(sessionId);

const clampStat = (value: number) => Math.max(0, value);

const applyStatUpdates = (stats: PlayerStats, updates: Partial<PlayerStats>) => {
  if (updates.hp !== undefined) {
    stats.hp = clampStat(stats.hp + updates.hp);
  }
  if (updates.sanity !== undefined) {
    stats.sanity = clampStat(stats.sanity + updates.sanity);
  }
  if (updates.str !== undefined) {
    stats.str = stats.str + updates.str;
  }
  if (updates.int !== undefined) {
    stats.int = stats.int + updates.int;
  }
  if (updates.dex !== undefined) {
    stats.dex = stats.dex + updates.dex;
  }
};

const pushHistory = (state: GameState, entry: GameState["history"][number]) => {
  const MAX_HISTORY = 24;
  state.history.push(entry);
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(-MAX_HISTORY);
  }
};

// Экспортируемая версия для использования в контроллере
export const pushHistoryEntry = pushHistory;

export const applyAiResponse = (
  state: GameState,
  aiResponse: AIResponse,
  userAction: string,
) => {
  applyStatUpdates(state.stats, aiResponse.stat_updates);

  let storyText = aiResponse.story_text;
  if (state.stats.hp <= 0 && !state.isGameOver) {
    state.isGameOver = true;
    storyText = `${storyText}\n\n${DEATH_TEXT}`;
  }

  pushHistory(state, { role: "user", parts: userAction });
  pushHistory(state, { role: "model", parts: storyText });

  return {
    storyText,
    choices: aiResponse.choices,
    imagePrompt: aiResponse.image_prompt,
  };
};

export const serializeState = (state: GameState) => ({
  stats: state.stats,
  inventory: state.inventory,
  tags: state.tags,
  isGameOver: state.isGameOver,
});
