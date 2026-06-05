import { loadSettings } from '../../utils/settings-store'
import { loadTuningGuide } from '../../utils/tuning-guide'

interface Message { role: 'user' | 'assistant'; content: string }
interface RequestBody { messages: Message[]; system?: string; provider?: string; bare?: boolean }

// SSE event shapes:
//   data: {"type":"thinking_delta","text":"..."}
//   data: {"type":"content_delta","text":"..."}
//   data: {"type":"done"}
//   data: {"type":"error","error":"..."}

function sseLine(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`
}

async function streamOllama(
  baseUrl: string, apiKey: string, model: string,
  system: string, messages: Message[],
  write: (chunk: string) => void,
) {
  // Aggressive caps to keep response times reasonable.
  // - max_tokens caps total output (thinking + content) at the provider level
  // - reasoning_effort / extra_body.reasoning hints — different models use different keys, send several harmlessly
  // - options.num_predict — Ollama-native cap as a backstop
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      // max_tokens is total budget (thinking + content). Earlier 2400 was being eaten entirely
      // by reasoning, leaving 0 content. 6000 gives reasoning room AND a substantive reply.
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
      max_tokens: 6000,
      temperature: 0.6,
      reasoning_effort: 'low',
      extra_body: { reasoning: { effort: 'low' } },
      chat_template_kwargs: { enable_thinking: true, thinking_budget: 512 },
      options: { num_predict: 6000, temperature: 0.6 },
    }),
  })
  if (!res.ok || !res.body) {
    write(sseLine({ type: 'error', error: `Provider HTTP ${res.status}: ${await res.text()}` }))
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  // Track whether we're inside a <think>...</think> block.
  let inThink = false
  let carry = ''   // stale partial tag bytes carried across deltas

  function emit(text: string) {
    if (!text) return
    let work = carry + text
    carry = ''
    while (work.length > 0) {
      if (inThink) {
        const close = work.indexOf('</think>')
        if (close === -1) {
          // hold last 7 chars in case a partial </think> straddles deltas
          if (work.length > 7) {
            write(sseLine({ type: 'thinking_delta', text: work.slice(0, -7) }))
            carry = work.slice(-7)
          } else {
            carry = work
          }
          return
        }
        const chunk = work.slice(0, close)
        if (chunk) write(sseLine({ type: 'thinking_delta', text: chunk }))
        work = work.slice(close + '</think>'.length)
        inThink = false
      } else {
        const open = work.indexOf('<think>')
        if (open === -1) {
          // hold last 6 chars in case '<think>' straddles deltas
          if (work.length > 6) {
            write(sseLine({ type: 'content_delta', text: work.slice(0, -6) }))
            carry = work.slice(-6)
          } else {
            carry = work
          }
          return
        }
        const chunk = work.slice(0, open)
        if (chunk) write(sseLine({ type: 'content_delta', text: chunk }))
        work = work.slice(open + '<think>'.length)
        inThink = true
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload) as {
          choices?: { delta?: { content?: string; reasoning?: string }; message?: { content?: string } }[]
        }
        const choice = data.choices?.[0]
        const reasoning = choice?.delta?.reasoning
        if (reasoning) write(sseLine({ type: 'thinking_delta', text: reasoning }))
        const delta = choice?.delta?.content ?? choice?.message?.content ?? ''
        if (delta) emit(delta)
      } catch { /* skip malformed line */ }
    }
  }
  if (carry) {
    if (inThink) write(sseLine({ type: 'thinking_delta', text: carry }))
    else write(sseLine({ type: 'content_delta', text: carry }))
  }
}

async function streamAnthropic(
  apiKey: string, system: string, messages: Message[],
  write: (chunk: string) => void,
) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      system,
      messages,
    }),
  })
  if (!res.ok || !res.body) {
    write(sseLine({ type: 'error', error: `Anthropic HTTP ${res.status}: ${await res.text()}` }))
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      try {
        const data = JSON.parse(payload) as {
          type?: string
          delta?: { type?: string; text?: string; thinking?: string }
        }
        if (data.type === 'content_block_delta') {
          if (data.delta?.type === 'thinking_delta' && data.delta.thinking) {
            write(sseLine({ type: 'thinking_delta', text: data.delta.thinking }))
          } else if (data.delta?.type === 'text_delta' && data.delta.text) {
            write(sseLine({ type: 'content_delta', text: data.delta.text }))
          }
        }
      } catch { /* skip */ }
    }
  }
}

async function streamOpenAI(
  apiKey: string, system: string, messages: Message[],
  write: (chunk: string) => void,
) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
    }),
  })
  if (!res.ok || !res.body) {
    write(sseLine({ type: 'error', error: `OpenAI HTTP ${res.status}: ${await res.text()}` }))
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
        const delta = data.choices?.[0]?.delta?.content
        if (delta) write(sseLine({ type: 'content_delta', text: delta }))
      } catch { /* skip */ }
    }
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RequestBody>(event)
  const cfg = loadSettings()
  const { messages, system: rawSystem = '', provider = cfg.activeProvider, bare = false } = body

  // Log every chat request so we can verify the client is reaching the server
  // (silent-send debugging — if this line never prints, the client never fired).
  const lastMsg = messages?.[messages.length - 1]?.content ?? '(no messages)'
  console.log(`[chat-stream] provider=${provider} bare=${bare} msgs=${messages?.length ?? 0} last="${lastMsg.slice(0, 80).replace(/\n/g, ' ')}"`)

  if (!messages?.length) throw createError({ statusCode: 400, statusMessage: 'messages required' })

  // Device note — short, used to tell the coach not to read input chop as driver error.
  // Important: do NOT pile on driver-input critique. Forza on controller has assists +
  // multiple steering modes (simulation, normal, assisted). Chop is the SYSTEM, not the
  // driver. Focus on what the CAR is doing, not how the inputs LOOK.
  const deviceNote = {
    controller: 'INPUT DEVICE: gamepad. Steering looks digital, throttle/brake can be triggery. This is the input device + Forza steering-assist modes, NOT driver inconsistency — do not critique input smoothness or "choppy steering". Focus your analysis on what the CAR is doing (yaw, slip, body angle).',
    wheel:      'INPUT DEVICE: racing wheel + pedals. Smooth analog inputs.',
    keyboard:   'INPUT DEVICE: keyboard — all inputs binary. Do not critique input technique.',
  }[cfg.inputDevice]
  // Canonical reference (the user's drift tuning bible) — injected on every
  // chat EXCEPT when the request is marked `bare` (live diagnostic mode where
  // the driver wants raw telemetry analysis without book theory bleeding in).
  const guideText = !bare ? loadTuningGuide() : ''
  const guideBlock = guideText
    ? [
        '## CANONICAL DRIFT TUNING REFERENCE (the bible)',
        'The following guide is the authoritative starting point for any tuning question. Treat its numbers and philosophy ("grip is your friend", weight distribution rules, alignment recipes, damper logic, etc.) as the default answer when nothing else contradicts it.',
        '',
        'HIERARCHY OF TRUTH — when sources conflict, prefer in this order:',
        '  1. The attached SESSION TELEMETRY (what the car is actually doing right now)',
        '  2. The driver\'s FEEL rating + Coach Memory entries (what THIS driver has learned about THIS car)',
        '  3. The REFERENCE LIBRARY of marked-good tunes (cross-car ground truth)',
        '  4. This canonical guide (book theory)',
        '',
        'When you recommend something that comes straight from the guide, briefly cite it ("per the canonical reference: …"). When you recommend something that DEVIATES from the guide because of the driver\'s signals, say so explicitly ("the guide suggests X but your FEEL/memory/telemetry shows Y, so…").',
        '',
        '--- BEGIN CANONICAL DRIFT TUNING GUIDE ---',
        guideText,
        '--- END CANONICAL DRIFT TUNING GUIDE ---',
      ].join('\n')
    : ''

  const system = [deviceNote, guideBlock, rawSystem].filter(Boolean).join('\n\n')

  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  setResponseHeader(event, 'Connection', 'keep-alive')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      try {
        if (provider === 'ollama-cloud') {
          const key = cfg.ollamaCloud.apiKey
          if (!key) {
            write(sseLine({ type: 'error', error: 'Ollama API key not set — configure it in Settings' }))
          } else {
            await streamOllama(cfg.ollamaCloud.baseUrl, key, cfg.ollamaCloud.model, system, messages, write)
          }
        } else if (provider === 'local-ollama') {
          await streamOllama(cfg.localOllama.baseUrl, 'ollama', cfg.localOllama.model, system, messages, write)
        } else if (provider === 'anthropic') {
          const key = cfg.anthropic.apiKey
          if (!key) write(sseLine({ type: 'error', error: 'Anthropic API key not set — configure it in Settings' }))
          else await streamAnthropic(key, system, messages, write)
        } else if (provider === 'openai') {
          const key = cfg.openai.apiKey
          if (!key) write(sseLine({ type: 'error', error: 'OpenAI API key not set — configure it in Settings' }))
          else await streamOpenAI(key, system, messages, write)
        } else {
          write(sseLine({ type: 'error', error: `Unknown provider: ${provider}` }))
        }
      } catch (e) {
        write(sseLine({ type: 'error', error: (e as Error).message }))
      } finally {
        write(sseLine({ type: 'done' }))
        controller.close()
      }
    },
  })

  return sendStream(event, stream)
})
