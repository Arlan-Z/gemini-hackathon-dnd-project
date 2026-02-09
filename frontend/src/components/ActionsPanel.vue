<script setup lang="ts">
import { Skull } from 'lucide-vue-next'
import type { GameState } from '../types'

const props = defineProps<{
  choices?: GameState['choices']
  loading: boolean
  isGameOver: boolean
  hasGameState: boolean
}>()

const emit = defineEmits<{
  (e: 'choose', value: string): void
  (e: 'start'): void
  (e: 'restart'): void
}>()

const choiceClass = (type: 'action' | 'aggressive' | 'stealth') => {
  if (type === 'aggressive') {
    return 'action-aggressive'
  }
  if (type === 'stealth') {
    return 'action-stealth'
  }
  return 'action-neutral'
}
</script>

<template>
  <section class="col-span-3 panel p-4 flex flex-wrap items-center gap-3">
    <div class="panel-title w-full">Доступные действия</div>
    <button
      v-for="choice in props.choices"
      :key="choice.text"
      type="button"
      class="action-btn"
      :class="choiceClass(choice.type)"
      :disabled="props.loading || props.isGameOver"
      @click="emit('choose', choice.text)"
    >
      {{ choice.text }}
    </button>
    <button
      v-if="!props.hasGameState"
      type="button"
      class="action-btn"
      @click="emit('start')"
    >
      Инициализировать
    </button>
    <div v-if="props.isGameOver" class="ml-auto flex items-center gap-3">
      <div class="flex items-center gap-2 text-red-400">
        <Skull class="w-4 h-4" />
        <span>Конец игры</span>
      </div>
      <button
        type="button"
        class="action-btn action-neutral"
        @click="emit('restart')"
      >
        Начать заново
      </button>
    </div>
  </section>
</template>
