import { loadTuningGuide } from '../../utils/tuning-guide'

export default defineEventHandler(() => {
  const text = loadTuningGuide()
  return {
    loaded: text.length > 0,
    chars: text.length,
    estTokens: Math.round(text.length / 4),
  }
})
