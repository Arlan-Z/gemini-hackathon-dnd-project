import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameState } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000/api'

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

      const data = (await response.json()) as GameState
      gameState.value = data
      return data
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
