import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export const useTypingText = (source: Ref<string | undefined>, speed = 18) => {
  const displayedText = ref('')
  const isTyping = ref(false)
  let timer: number | undefined

  const stopTimer = () => {
    if (timer) {
      window.clearInterval(timer)
    }
    timer = undefined
  }

  const startTyping = (text: string) => {
    stopTimer()
    if (!text) {
      displayedText.value = ''
      isTyping.value = false
      return
    }

    let index = 0
    displayedText.value = ''
    isTyping.value = true

    timer = window.setInterval(() => {
      index += 1
      displayedText.value = text.slice(0, index)

      if (index >= text.length) {
        stopTimer()
        isTyping.value = false
      }
    }, speed)
  }

  const skipTyping = () => {
    stopTimer()
    displayedText.value = source.value ?? ''
    isTyping.value = false
  }

  watch(
    source,
    (text) => {
      if (text !== undefined) {
        startTyping(text)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopTimer()
  })

  return { displayedText, isTyping, skipTyping }
}
