<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useGameStore } from './stores/game'
import {
  AlertTriangle,
  Brain,
  HeartPulse,
  Package,
  Radio,
  Skull,
  Sword,
  Eye
} from 'lucide-vue-next'

const store = useGameStore()

const displayedText = ref('')
const isTyping = ref(false)
let typingTimer: number | undefined
const typingSpeed = 18

const startTyping = (text: string) => {
  if (typingTimer) {
    window.clearInterval(typingTimer)
  }
  if (!text) {
    displayedText.value = ''
    isTyping.value = false
    return
  }

  let index = 0
  displayedText.value = ''
  isTyping.value = true

  typingTimer = window.setInterval(() => {
    index += 1
    displayedText.value = text.slice(0, index)

    if (index >= text.length) {
      window.clearInterval(typingTimer)
      isTyping.value = false
    }
  }, typingSpeed)
}

const skipTyping = () => {
  if (typingTimer) {
    window.clearInterval(typingTimer)
  }
  displayedText.value = store.gameState?.story_text ?? ''
  isTyping.value = false
}

watch(
  () => store.gameState?.story_text,
  (text) => {
    if (text) {
      startTyping(text)
    }
  },
  { immediate: true }
)

const imageGlitch = ref(false)
watch(
  () => [store.gameState?.imageUrl, store.gameState?.image_prompt],
  () => {
    imageGlitch.value = true
    window.setTimeout(() => {
      imageGlitch.value = false
    }, 420)
  }
)

const selectedItemId = ref<string | null>(null)
const selectedItem = computed(() =>
  store.gameState?.inventory.find((item) => item.id === selectedItemId.value)
)

const statMax = 100
const statPercent = (value: number) =>
  Math.min(100, Math.max(0, (value / statMax) * 100))

const stats = computed(() => {
  const values = store.gameState?.stats
  if (!values) {
    return []
  }

  return [
    { key: 'hp', label: 'HP', value: values.hp, icon: HeartPulse, color: 'text-red-400' },
    { key: 'sanity', label: 'Sanity', value: values.sanity, icon: Brain, color: 'text-amber-300' },
    { key: 'strength', label: 'Strength', value: values.strength, icon: Sword, color: 'text-green-300' },
    {
      key: 'intelligence',
      label: 'Intelligence',
      value: values.intelligence,
      icon: Eye,
      color: 'text-cyan-200'
    }
  ]
})

const choiceClass = (type: 'action' | 'aggressive' | 'stealth') => {
  if (type === 'aggressive') {
    return 'action-aggressive'
  }
  if (type === 'stealth') {
    return 'action-stealth'
  }
  return 'action-neutral'
}

const formatTag = (tag: string) => tag.replace(/_/g, ' ')

const chooseAction = async (choiceText: string) => {
  if (store.loading || store.gameState?.isGameOver) {
    return
  }
  await store.sendAction(choiceText, selectedItemId.value ?? undefined)
  selectedItemId.value = null
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
      <header class="flex items-center justify-between px-6 py-4 border-b border-green-500/30">
        <div class="flex items-center gap-3">
          <Radio class="w-4 h-4 text-green-300" />
          <div>
            <div class="text-sm uppercase tracking-[0.4em] flicker">Командный центр</div>
            <div class="text-xs text-green-300/70">ЯДРО AM / ЧЕЛОВЕК</div>
          </div>
        </div>
        <div class="text-xs text-green-300/60">
          Сессия: {{ store.gameState?.sessionId ?? '---' }}
        </div>
      </header>

      <main
        class="grid grid-cols-[260px_minmax(0,1fr)_260px] grid-rows-[1fr_auto] gap-4 p-6"
      >
        <aside class="panel p-4 space-y-5">
          <div>
            <div class="panel-title mb-3">Жизненные показатели</div>
            <div class="space-y-3">
              <div v-for="stat in stats" :key="stat.key" class="space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <component :is="stat.icon" class="w-4 h-4" :class="stat.color" />
                    <span>{{ stat.label }}</span>
                  </div>
                  <span class="text-green-300/70">{{ stat.value }}</span>
                </div>
                <div class="stat-bar">
                  <span :style="{ width: `${statPercent(stat.value)}%` }"></span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="panel-title mb-2">Tags</div>
            <div class="flex flex-wrap gap-2">
              <span v-if="!store.gameState?.tags?.length" class="text-xs text-green-300/50">
                Аномалий нет
              </span>
              <span v-for="tag in store.gameState?.tags" :key="tag" class="tag">
                {{ formatTag(tag) }}
              </span>
            </div>
          </div>

          <div v-if="store.error" class="text-xs text-red-400 border border-red-500/40 p-2">
            {{ store.error }}
          </div>
        </aside>

        <section class="panel p-4 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="panel-title">Сводка событий</div>
            <div class="text-xs text-green-300/60">
              {{ store.loading ? 'Обработка...' : 'Ожидание ввода' }}
            </div>
          </div>

          <div class="image-frame flex-1">
            <img
              v-if="store.gameState?.imageUrl"
              :src="store.gameState.imageUrl"
              alt="scene"
              class="image-frame-img"
              :class="{ glitch: imageGlitch }"
            >
            <div v-else class="text-xs text-green-300/60 uppercase tracking-[0.3em] text-center">
              [СИГНАЛ ИЗОБРАЖЕНИЯ ПОТЕРЯН]
              <div class="text-green-400/80 normal-case tracking-normal mt-2">
                {{ store.gameState?.image_prompt ?? 'Сигнал отсутствует' }}
              </div>
            </div>
          </div>

          <div class="story-box">
            <p class="story-text" :class="{ typing: isTyping }" @click="skipTyping">
              {{ displayedText }}
            </p>
            <div class="text-[10px] text-green-300/40 mt-2">
              Нажмите на текст, чтобы пропустить печать.
            </div>
          </div>
        </section>

        <aside class="panel p-4 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="panel-title">Инвентарь</div>
            <Package class="w-4 h-4 text-green-300/70" />
          </div>

          <div class="flex-1 overflow-auto space-y-2 pr-1">
            <button
              v-for="item in store.gameState?.inventory"
              :key="item.id"
              type="button"
              class="inventory-item"
              :class="{ 'inventory-item-active': selectedItemId === item.id }"
              @click="selectedItemId = selectedItemId === item.id ? null : item.id"
            >
              <div class="text-sm">{{ item.name }}</div>
              <div class="text-xs text-green-300/60">{{ item.description }}</div>
            </button>
            <div v-if="!store.gameState?.inventory?.length" class="text-xs text-green-300/50">
              Пусто
            </div>
          </div>

          <div class="border-t border-green-500/30 pt-3 text-xs text-green-300/70">
            <div class="flex items-center gap-2">
              <AlertTriangle class="w-4 h-4 text-amber-300" />
              <span>Выбрано: {{ selectedItem?.name ?? 'Нет' }}</span>
            </div>
          </div>
        </aside>

        <section class="col-span-3 panel p-4 flex flex-wrap items-center gap-3">
          <div class="panel-title w-full">Доступные действия</div>
          <button
            v-for="choice in store.gameState?.choices"
            :key="choice.text"
            type="button"
            class="action-btn"
            :class="choiceClass(choice.type)"
            :disabled="store.loading || store.gameState?.isGameOver"
            @click="chooseAction(choice.text)"
          >
            {{ choice.text }}
          </button>
          <button
            v-if="!store.gameState"
            type="button"
            class="action-btn"
            @click="store.startGame()"
          >
            Инициализировать
          </button>
          <div v-if="store.gameState?.isGameOver" class="ml-auto flex items-center gap-3">
            <div class="flex items-center gap-2 text-red-400">
              <Skull class="w-4 h-4" />
              <span>Конец игры</span>
            </div>
            <button
              type="button"
              class="action-btn action-neutral"
              @click="store.restartGame()"
            >
              Начать заново
            </button>
          </div>
        </section>
      </main>

      <div
        v-if="store.gameState?.isGameOver"
        class="absolute inset-0 pointer-events-none flex items-center justify-center"
      >
        <div class="gameover">Субъект уничтожен</div>
      </div>
    </div>
  </div>
</template>
