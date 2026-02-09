<script setup lang="ts">
defineProps<{ visible: boolean }>()
</script>

<template>
  <div
    v-if="visible"
    class="absolute inset-0 pointer-events-none flex items-center justify-center"
  >
    <div class="gameover">Субъект уничтожен</div>
  </div>
</template>
