<script setup lang="ts">
defineProps<{ sessionId?: string }>()
</script>

<template>
  <header class="flex items-center justify-between px-6 py-4 border-b border-green-500/30">
    <div class="flex items-center gap-3">
      <div class="w-4 h-4 text-green-300">
        <slot name="icon"></slot>
      </div>
      <div>
        <div class="text-sm uppercase tracking-[0.4em] flicker">Командный центр</div>
        <div class="text-xs text-green-300/70">ЯДРО AM / ЧЕЛОВЕК</div>
      </div>
    </div>
    <div class="text-xs text-green-300/60">Сессия: {{ sessionId ?? '---' }}</div>
  </header>
</template>
