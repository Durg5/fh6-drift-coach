import { loadSettings } from '../../utils/settings-store'

/**
 * Provider readiness — reads the same settings store the chat-stream endpoint
 * uses, so the UI's "is this provider usable" check matches reality.
 *
 * Previous bug: this endpoint checked process.env.* but keys live in
 * ~/.config/drift-coach/settings.json — so it always returned ready=false,
 * which made the client UI refuse to dispatch chat requests.
 */
export default defineEventHandler(() => {
  const s = loadSettings()

  const available = [
    {
      name: 'ollama-cloud',
      label: 'Ollama Cloud',
      model: s.ollamaCloud.model,
      ready: !!(s.ollamaCloud.apiKey && s.ollamaCloud.baseUrl),
    },
    {
      name: 'local-ollama',
      label: 'Local Ollama',
      model: s.localOllama.model,
      ready: !!s.localOllama.baseUrl,
    },
    {
      name: 'anthropic',
      label: 'Anthropic',
      model: 'claude-sonnet-4-6',
      ready: !!s.anthropic.apiKey,
    },
    {
      name: 'openai',
      label: 'OpenAI',
      model: 'gpt-4o',
      ready: !!s.openai.apiKey,
    },
  ]

  return { default: s.activeProvider, available }
})
