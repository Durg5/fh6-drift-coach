import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Canonical drift-tuning reference. Sourced from the user's curated
 * markdown guide (derived from a 40-min FH6 deep-dive video).
 *
 * Read once and cached in memory; refreshed automatically when the file's
 * mtime changes so the user can edit the guide without restarting the server.
 *
 * If override env var DRIFT_GUIDE_PATH is set, that path is used instead of
 * the default ~/DRIFT_COACH_TUNING_GUIDE.md.
 */

const DEFAULT_PATH = join(homedir(), 'DRIFT_COACH_TUNING_GUIDE.md')

interface Cached {
  path: string
  mtimeMs: number
  text: string
}

let cache: Cached | null = null

function guidePath(): string {
  return process.env.DRIFT_GUIDE_PATH || DEFAULT_PATH
}

export function loadTuningGuide(): string {
  const path = guidePath()
  try {
    const st = statSync(path)
    if (cache && cache.path === path && cache.mtimeMs === st.mtimeMs) {
      return cache.text
    }
    const text = readFileSync(path, 'utf-8')
    cache = { path, mtimeMs: st.mtimeMs, text }
    return text
  } catch {
    // Guide is optional — if file missing, return empty so the system prompt
    // is shorter rather than erroring the chat.
    cache = null
    return ''
  }
}

export function hasTuningGuide(): boolean {
  return loadTuningGuide().length > 0
}
