import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR  = join(homedir(), '.config', 'drift-coach', 'sessions')
const INDEX = join(homedir(), '.config', 'drift-coach', 'sessions-index.json')

export interface SessionIndexEntry {
  id: string
  name: string
  createdAt: string
  durationSec: number
  frameCount: number
  carName: string
  carKey: string
  feel: string  // 'na' | 'good' | 'medium' | 'bad'
  piClass: string
  driftScore: number
  driftTimeSec: number
  spinCount: number
  maxAngle: number
}

export interface SavedSession {
  id: string
  name: string
  createdAt: string
  notes?: string
  tuneSnapshot: Record<string, unknown>
  stats: Record<string, unknown>
}

function ensureDir() {
  mkdirSync(DIR, { recursive: true })
}

function loadIndex(): SessionIndexEntry[] {
  try { return JSON.parse(readFileSync(INDEX, 'utf-8')) as SessionIndexEntry[] }
  catch { return [] }
}

function saveIndex(entries: SessionIndexEntry[]) {
  writeFileSync(INDEX, JSON.stringify(entries, null, 2), 'utf-8')
}

export function listSessions(carKey?: string): SessionIndexEntry[] {
  const all = loadIndex().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!carKey) return all
  return all.filter(e => (e.carKey ?? '') === carKey)
}

export function readSession(id: string): SavedSession | null {
  const file = join(DIR, `${id}.json`)
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf-8')) as SavedSession }
  catch { return null }
}

export function writeSession(
  name: string,
  tuneSnapshot: Record<string, unknown>,
  stats: Record<string, unknown>,
  notes?: string,
): SavedSession {
  ensureDir()
  const id = Date.now().toString()
  const session: SavedSession = {
    id,
    name: name || `Session ${id}`,
    createdAt: new Date().toISOString(),
    notes,
    tuneSnapshot,
    stats,
  }
  writeFileSync(join(DIR, `${id}.json`), JSON.stringify(session, null, 2), 'utf-8')

  // Derive a stable car key for siloing — sent from client; defaults to empty if not provided.
  const carKey = String((tuneSnapshot as { carKey?: string }).carKey ?? '')
  const feel   = String((tuneSnapshot as { feel?: string  }).feel   ?? 'na')
  const entry: SessionIndexEntry = {
    id,
    name: session.name,
    createdAt: session.createdAt,
    durationSec: Math.round(Number(stats.durationMs ?? 0) / 1000),
    frameCount: Number(stats.frameCount ?? 0),
    carName: String(tuneSnapshot.carName ?? '?'),
    carKey,
    feel,
    piClass: String(tuneSnapshot.piClass ?? '?'),
    driftScore: Number(stats.driftScore ?? 0),
    driftTimeSec: Number(stats.driftTimeSec ?? 0),
    spinCount: Array.isArray(stats.spins) ? stats.spins.length : 0,
    maxAngle: Number(stats.maxDriftAngle ?? 0),
  }
  const index = loadIndex()
  index.push(entry)
  saveIndex(index)
  return session
}

export function deleteSession(id: string): boolean {
  const file = join(DIR, `${id}.json`)
  if (existsSync(file)) { try { unlinkSync(file) } catch {} }
  const next = loadIndex().filter(s => s.id !== id)
  saveIndex(next)
  return true
}
