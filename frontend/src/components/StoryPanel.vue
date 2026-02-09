<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useLoadingDots } from '../composables/useLoadingDots'
import { useTypingText } from '../composables/useTypingText'

const props = defineProps<{
  loading: boolean
  storyText: string
  imageUrl?: string
  imagePrompt?: string
}>()

const storySource = computed(() => props.storyText)
const { displayedText, isTyping, skipTyping } = useTypingText(storySource)

const loadingSource = computed(() => props.loading)
const { loadingText } = useLoadingDots(loadingSource)

const imageGlitch = ref(false)
watch(
  () => [props.imageUrl, props.imagePrompt],
  () => {
    imageGlitch.value = true
    window.setTimeout(() => {
      imageGlitch.value = false
    }, 420)
  }
)
</script>

<template>
  <section class="panel p-4 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div class="panel-title">Event log</div>
      <div class="text-xs text-green-300/60">
        {{ props.loading ? loadingText : 'Awaiting input' }}
      </div>
    </div>

    <div class="image-frame flex-1">
      <img
        v-if="props.imageUrl"
        :src="props.imageUrl"
        alt="scene"
        class="image-frame-img"
        :class="{ glitch: imageGlitch }"
      >
      <div v-else class="text-xs text-green-300/60 uppercase tracking-[0.3em] text-center">
        [IMAGE SIGNAL LOST]
        <div class="text-green-400/80 normal-case tracking-normal mt-2">
          {{ props.imagePrompt ?? 'Signal unavailable' }}
        </div>
      </div>
    </div>

    <div class="story-box">
      <p class="story-text" :class="{ typing: isTyping }" @click="skipTyping">
        {{ displayedText }}
      </p>
      <div class="text-[10px] text-green-300/40 mt-2">
        Click the text to skip typing.
      </div>
    </div>
  </section>
</template>
