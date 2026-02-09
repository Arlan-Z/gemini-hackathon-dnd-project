<script setup lang="ts">
import { Package } from 'lucide-vue-next'
import type { GameState } from '../types'

const props = defineProps<{
  inventory?: GameState['inventory']
}>()
</script>

<template>
  <aside class="panel p-4 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="panel-title">Inventory</div>
      <Package class="w-4 h-4 text-green-300/70" />
    </div>

    <div class="flex-1 overflow-auto space-y-2 pr-1">
      <div
        v-for="item in props.inventory"
        :key="item.id"
        class="inventory-item"
      >
        <div class="text-sm">{{ item.name }}</div>
        <div class="text-xs text-green-300/60">{{ item.description }}</div>
      </div>
      <div v-if="!props.inventory?.length" class="text-xs text-green-300/50">
        Empty
      </div>
    </div>

  </aside>
</template>
