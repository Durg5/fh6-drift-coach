import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR  = join(homedir(), '.config', 'drift-coach')
const FILE = join(DIR, 'settings.json')

export type InputDevice = 'controller' | 'wheel' | 'keyboard'

export interface DriftSettings {
  activeProvider: string
  inputDevice: InputDevice
  ollamaCloud: { apiKey: string; baseUrl: string; model: string }
  localOllama: { baseUrl: string; model: string }
  anthropic: { apiKey: string }
  openai: { apiKey: string }
}

const DEFAULTS: DriftSettings = {
  activeProvider: 'ollama-cloud',
  inputDevice: 'controller',
  ollamaCloud: {
    apiKey:  process.env.OLLAMA_API_KEY  ?? '',
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/v1',
    model:   process.env.OLLAMA_MODEL    ?? 'minimax-m3:cloud',
  },
  localOllama: {
    baseUrl: process.env.LOCAL_OLLAMA_URL   ?? 'http://localhost:11434/v1',
    model:   process.env.LOCAL_OLLAMA_MODEL ?? 'llama3.2',
  },
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY ?? '' },
  openai:    { apiKey: process.env.OPENAI_API_KEY    ?? '' },
}

export function loadSettings(): DriftSettings {
  try {
    const raw = readFileSync(FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DriftSettings>
    // Spread then re-coalesce — `{ ...DEFAULTS, ...parsed }` lets `null` win
    // over a default, which broke `inputDevice` (null → no device note in prompt).
    return {
      activeProvider: parsed.activeProvider ?? DEFAULTS.activeProvider,
      inputDevice:    parsed.inputDevice    ?? DEFAULTS.inputDevice,
      ollamaCloud: { ...DEFAULTS.ollamaCloud, ...(parsed.ollamaCloud ?? {}) },
      localOllama: { ...DEFAULTS.localOllama, ...(parsed.localOllama ?? {}) },
      anthropic:   { ...DEFAULTS.anthropic,   ...(parsed.anthropic   ?? {}) },
      openai:      { ...DEFAULTS.openai,      ...(parsed.openai      ?? {}) },
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(partial: Partial<DriftSettings>): DriftSettings {
  mkdirSync(DIR, { recursive: true })
  const current = loadSettings()
  const next: DriftSettings = {
    ...current,
    ...partial,
    ollamaCloud: { ...current.ollamaCloud, ...(partial.ollamaCloud ?? {}) },
    localOllama: { ...current.localOllama, ...(partial.localOllama ?? {}) },
    anthropic:   { ...current.anthropic,   ...(partial.anthropic   ?? {}) },
    openai:      { ...current.openai,      ...(partial.openai      ?? {}) },
  }
  writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf-8')
  return next
}
