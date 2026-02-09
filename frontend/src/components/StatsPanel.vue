<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Brain, Crosshair, Eye, HeartPulse, Sword } from 'lucide-vue-next'
import type { GameState } from '../types'

const props = defineProps<{
  stats?: GameState['stats']
  tags?: string[]
  error?: string | null
}>()

const statMax = 100
const statPercent = (value: number) => Math.min(100, Math.max(0, (value / statMax) * 100))

const stats = computed(() => {
  if (!props.stats) {
    return []
  }

  return [
    { key: 'hp', label: 'HP', value: props.stats.hp, icon: HeartPulse, color: 'text-red-400' },
    { key: 'sanity', label: 'Sanity', value: props.stats.sanity, icon: Brain, color: 'text-amber-300' },
    { key: 'strength', label: 'Strength', value: props.stats.strength, icon: Sword, color: 'text-green-300' },
    {
      key: 'intelligence',
      label: 'Intelligence',
      value: props.stats.intelligence,
      icon: Eye,
      color: 'text-cyan-200'
    },
    {
      key: 'dexterity',
      label: 'Dexterity',
      value: props.stats.dexterity,
      icon: Crosshair,
      color: 'text-sky-300'
    }
  ]
})

const formatTag = (tag: string) => tag.replace(/_/g, ' ')
</script>

<template>
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
          <div
            v-if="stat.key === 'sanity' || stat.key === 'dexterity'"
            class="stat-divider"
          ></div>
        </div>
      </div>
    </div>

    <div>
      <div class="panel-title mb-2">Tags</div>
      <div class="flex flex-wrap gap-2">
        <span v-if="!props.tags?.length" class="text-xs text-green-300/50">
          Аномалий нет
        </span>
        <span v-for="tag in props.tags" :key="tag" class="tag">
          {{ formatTag(tag) }}
        </span>
      </div>
    </div>

    <div v-if="props.error" class="text-xs text-red-400 border border-red-500/40 p-2">
      {{ props.error }}
    </div>
  </aside>
</template>
