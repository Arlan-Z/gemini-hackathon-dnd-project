import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

export const useLoadingDots = (
  isLoading: Ref<boolean>,
  baseText = 'Processing',
  interval = 400
) => {
  const frames = [`${baseText}...`, `${baseText}..`, `${baseText}.`, `${baseText}`]
  const loadingText = ref(frames[0])
  let timer: number | undefined

  const stopTimer = () => {
    if (timer) {
      window.clearInterval(timer)
    }
    timer = undefined
    loadingText.value = frames[0]
  }

  const startTimer = () => {
    stopTimer()
    let index = 0
    loadingText.value = frames[index]
    timer = window.setInterval(() => {
      index = (index + 1) % frames.length
      loadingText.value = frames[index]
    }, interval)
  }

  watch(
    isLoading,
    (active) => {
      if (active) {
        startTimer()
      } else {
        stopTimer()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopTimer()
  })

  return { loadingText }
}
