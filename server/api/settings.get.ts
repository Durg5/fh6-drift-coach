import { loadSettings } from '../utils/settings-store'

export default defineEventHandler(() => {
  const s = loadSettings()
  return {
    activeProvider: s.activeProvider,
    inputDevice: s.inputDevice,
    ollamaCloud: {
      apiKey:  s.ollamaCloud.apiKey  ? '••••' + s.ollamaCloud.apiKey.slice(-4) : '',
      baseUrl: s.ollamaCloud.baseUrl,
      model:   s.ollamaCloud.model,
      hasKey:  s.ollamaCloud.apiKey.length > 0,
    },
    localOllama: {
      baseUrl: s.localOllama.baseUrl,
      model:   s.localOllama.model,
    },
    anthropic: {
      apiKey: s.anthropic.apiKey ? '••••' + s.anthropic.apiKey.slice(-4) : '',
      hasKey: s.anthropic.apiKey.length > 0,
    },
    openai: {
      apiKey: s.openai.apiKey ? '••••' + s.openai.apiKey.slice(-4) : '',
      hasKey: s.openai.apiKey.length > 0,
    },
  }
})
