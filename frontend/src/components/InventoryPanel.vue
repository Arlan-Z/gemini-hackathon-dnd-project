<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Package } from 'lucide-vue-next'
import type { GameState } from '../types'

const props = defineProps<{
  inventory?: GameState['inventory']
  selectedItemId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:selectedItemId', value: string | null): void
}>()

const selectedItem = computed(() =>
  props.inventory?.find((item) => item.id === props.selectedItemId)
)

const toggleItem = (id: string) => {
  emit('update:selectedItemId', props.selectedItemId === id ? null : id)
}
</script>

<template>
  <aside class="panel p-4 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="panel-title">Inventory</div>
      <Package class="w-4 h-4 text-green-300/70" />
    </div>

    <div class="flex-1 overflow-auto space-y-2 pr-1">
      <button
        v-for="item in props.inventory"
        :key="item.id"
        type="button"
        class="inventory-item"
        :class="{ 'inventory-item-active': selectedItemId === item.id }"
        @click="toggleItem(item.id)"
      >
        <div class="text-sm">{{ item.name }}</div>
        <div class="text-xs text-green-300/60">{{ item.description }}</div>
      </button>
      <div v-if="!props.inventory?.length" class="text-xs text-green-300/50">
        Empty
      </div>
    </div>

    <div class="border-t border-green-500/30 pt-3 text-xs text-green-300/70">
      <div class="flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 text-amber-300" />
        <span>Selected: {{ selectedItem?.name ?? 'None' }}</span>
      </div>
    </div>
  </aside>
</template>
