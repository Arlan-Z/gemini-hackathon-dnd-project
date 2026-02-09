<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Radio } from 'lucide-vue-next'
import { useGameStore } from './stores/game'
import AppHeader from './components/AppHeader.vue'
import StatsPanel from './components/StatsPanel.vue'
import StoryPanel from './components/StoryPanel.vue'
import InventoryPanel from './components/InventoryPanel.vue'
import ActionsPanel from './components/ActionsPanel.vue'
import GameOverOverlay from './components/GameOverOverlay.vue'

const store = useGameStore()

const selectedItemId = ref<string | null>(null)

const chooseAction = async (choiceText: string) => {
  if (store.loading || store.gameState?.isGameOver) {
    return
  }
  await store.sendAction(choiceText, selectedItemId.value ?? undefined)
  selectedItemId.value = null
}

const startGame = async () => {
  await store.startGame()
}

const restartGame = async () => {
  await store.restartGame()
}

onMounted(() => {
  if (!store.gameState && !store.loading) {
    store.startGame()
  }
})
</script>

<template>
  <div class="min-h-screen bg-black text-green-400">
    <div class="min-h-screen crt scanlines relative">
      <AppHeader :session-id="store.gameState?.sessionId">
        <template #icon>
          <Radio class="w-4 h-4 text-green-300" />
        </template>
      </AppHeader>

      <main
        class="grid grid-cols-[260px_minmax(0,1fr)_260px] grid-rows-[1fr_auto] gap-4 p-6"
      >
        <StatsPanel
          :stats="store.gameState?.stats"
          :tags="store.gameState?.tags"
          :error="store.error"
        />

        <StoryPanel
          :loading="store.loading"
          :story-text="store.gameState?.story_text ?? ''"
          :image-url="store.gameState?.imageUrl"
          :image-prompt="store.gameState?.image_prompt"
        />

        <InventoryPanel
          v-model:selectedItemId="selectedItemId"
          :inventory="store.gameState?.inventory"
        />

        <ActionsPanel
          :choices="store.gameState?.choices"
          :loading="store.loading"
          :is-game-over="store.gameState?.isGameOver ?? false"
          :has-game-state="Boolean(store.gameState)"
          @choose="chooseAction"
          @start="startGame"
          @restart="restartGame"
        />
      </main>

      <GameOverOverlay :visible="store.gameState?.isGameOver ?? false" />
    </div>
  </div>
</template>
