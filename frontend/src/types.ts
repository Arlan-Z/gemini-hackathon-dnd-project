export interface GameState {
  sessionId: string
  stats: { hp: number; sanity: number; strength: number; intelligence: number; dexterity: number }
  inventory: Array<{ id: string; name: string; description: string; imagePrompt?: string }>
  tags: string[]
  story_text: string
  choices: Array<{
    text: string
    type: 'action' | 'aggressive' | 'stealth'
    check?: { stat: 'strength' | 'intelligence' | 'dexterity'; required: number }
  }>
  image_prompt: string
  imageUrl?: string
  imageBase64?: string
  isGameOver: boolean
}
