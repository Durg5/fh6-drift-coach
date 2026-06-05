import { saveSettings } from '../utils/settings-store'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }

  const saved = saveSettings(body)

  return {
    ok: true,
    activeProvider: saved.activeProvider,
    ollamaCloud: { hasKey: saved.ollamaCloud.apiKey.length > 0, model: saved.ollamaCloud.model, baseUrl: saved.ollamaCloud.baseUrl },
    localOllama: { model: saved.localOllama.model, baseUrl: saved.localOllama.baseUrl },
    anthropic:   { hasKey: saved.anthropic.apiKey.length > 0 },
    openai:      { hasKey: saved.openai.apiKey.length > 0 },
  }
})
