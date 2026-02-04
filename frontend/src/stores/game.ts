import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameState } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api'

type RawChoice = { text?: unknown; type?: unknown }

const normalizeChoices = (choices: unknown) => {
  if (!Array.isArray(choices)) {
    return []
  }

  return choices
    .map((choice): GameState['choices'][number] | null => {
      if (typeof choice === 'string') {
        return { text: choice, type: 'action' }
      }
      if (choice && typeof choice === 'object') {
        const raw = choice as RawChoice
        const text = typeof raw.text === 'string' ? raw.text : ''
        const type = raw.type === 'aggressive' || raw.type === 'stealth' ? raw.type : 'action'
        return text ? { text, type } : null
      }
      return null
    })
    .filter((choice): choice is GameState['choices'][number] => Boolean(choice))
}

const normalizeGameState = (payload: any): GameState => {
  const rawState = payload?.state ?? payload ?? {}
  const rawStats = rawState.stats ?? {}

  const stats = {
    hp: rawStats.hp ?? 0,
    sanity: rawStats.sanity ?? 0,
    strength: rawStats.strength ?? rawStats.str ?? 0,
    intelligence: rawStats.intelligence ?? rawStats.int ?? 0
  }

  const inventory = Array.isArray(rawState.inventory)
    ? rawState.inventory.map((item: any) => ({
        id: String(item?.id ?? ''),
        name: String(item?.name ?? ''),
        description: String(item?.description ?? item?.desc ?? ''),
        imagePrompt: item?.imagePrompt ?? item?.image_prompt
      }))
    : []

  return {
    sessionId: payload?.sessionId ?? rawState.sessionId ?? '',
    stats,
    inventory,
    tags: Array.isArray(rawState.tags) ? rawState.tags : [],
    story_text: payload?.story_text ?? rawState.story_text ?? '',
    choices: normalizeChoices(payload?.choices ?? rawState.choices),
    image_prompt: payload?.image_prompt ?? rawState.image_prompt ?? '',
    imageUrl:
      payload?.imageUrl ?? payload?.image_url ?? rawState.imageUrl ?? rawState.image_url ?? undefined,
    isGameOver: Boolean(rawState.isGameOver ?? payload?.isGameOver)
  }
}

export const useGameStore = defineStore('game', () => {
  const gameState = ref<GameState | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const request = async (path: string, body?: unknown) => {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || response.statusText)
      }

      const data = await response.json()
      const normalized = normalizeGameState(data)
      gameState.value = normalized
      return normalized
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      throw err
    } finally {
      loading.value = false
    }
  }

  const startGame = async () => {
    await request('/start')
  }

  const sendAction = async (action: string, useItemId?: string) => {
    if (!gameState.value?.sessionId) {
      await startGame()
    }

    const payload = {
      sessionId: gameState.value?.sessionId ?? '',
      action,
      ...(useItemId ? { useItemId } : {})
    }

    await request('/action', payload)
  }

  return { gameState, loading, error, startGame, sendAction }
})
