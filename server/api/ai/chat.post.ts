import { loadSettings } from '../../utils/settings-store'

interface Message { role: 'user' | 'assistant'; content: string }

interface RequestBody {
  messages: Message[]
  system?: string
  provider?: string
}

async function callOllama(baseUrl: string, apiKey: string, model: string, system: string, messages: Message[]) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      stream: false,
    }),
  })
  if (!res.ok) throw createError({ statusCode: res.status, statusMessage: await res.text() })
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
}

async function callAnthropic(apiKey: string, system: string, messages: Message[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system,
      messages,
    }),
  })
  if (!res.ok) throw createError({ statusCode: res.status, statusMessage: await res.text() })
  const data = await res.json() as { content: { type: string; text: string }[] }
  return data.content.find(c => c.type === 'text')?.text ?? ''
}

async function callOpenAI(apiKey: string, system: string, messages: Message[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  })
  if (!res.ok) throw createError({ statusCode: res.status, statusMessage: await res.text() })
  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0]?.message?.content ?? ''
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RequestBody>(event)
  const cfg = loadSettings()
  const { messages, system: rawSystem = '', provider = cfg.activeProvider } = body

  if (!messages?.length) throw createError({ statusCode: 400, statusMessage: 'messages required' })

  const deviceNote = {
    controller: 'INPUT DEVICE: gamepad/controller. Steering values are digital-feeling and will look choppy in telemetry; treat rapid steer changes as device characteristics, NOT driver inconsistency. Throttle/brake may also be binary-ish from triggers.',
    wheel:      'INPUT DEVICE: racing wheel + pedals. Smooth inputs are expected; choppiness is genuine driver feedback.',
    keyboard:   'INPUT DEVICE: keyboard. All inputs are binary on/off — steering, throttle, and brake will show 100% or 0% with no analog gradient. Do not interpret this as poor technique.',
  }[cfg.inputDevice]

  const system = [deviceNote, rawSystem].filter(Boolean).join('\n\n')

  let content = ''

  if (provider === 'ollama-cloud') {
    const key = cfg.ollamaCloud.apiKey
    const url = cfg.ollamaCloud.baseUrl
    const model = cfg.ollamaCloud.model
    if (!key) throw createError({ statusCode: 503, statusMessage: 'Ollama API key not set — configure it in Settings' })
    content = await callOllama(url, key, model, system, messages)
  } else if (provider === 'local-ollama') {
    const url = cfg.localOllama.baseUrl
    const model = cfg.localOllama.model
    content = await callOllama(url, 'ollama', model, system, messages)
  } else if (provider === 'anthropic') {
    const key = cfg.anthropic.apiKey
    if (!key) throw createError({ statusCode: 503, statusMessage: 'Anthropic API key not set — configure it in Settings' })
    content = await callAnthropic(key, system, messages)
  } else if (provider === 'openai') {
    const key = cfg.openai.apiKey
    if (!key) throw createError({ statusCode: 503, statusMessage: 'OpenAI API key not set — configure it in Settings' })
    content = await callOpenAI(key, system, messages)
  } else {
    throw createError({ statusCode: 400, statusMessage: `Unknown provider: ${provider}` })
  }

  return { content, provider }
})
