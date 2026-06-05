import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR  = join(homedir(), '.config', 'drift-coach')
const FILE = join(DIR, 'coach-memory.json')

export interface CoachMemoryEntry {
  id: string
  createdAt: string
  text: string
  carName?: string
  carKey?: string
  sessionId?: string  // optional link back to a saved session
}

function load(): CoachMemoryEntry[] {
  try { return JSON.parse(readFileSync(FILE, 'utf-8')) as CoachMemoryEntry[] }
  catch { return [] }
}

function save(entries: CoachMemoryEntry[]) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export function listMemory(carKey?: string): CoachMemoryEntry[] {
  const all = load().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (!carKey) return all
  return all.filter(e => (e.carKey ?? '') === carKey)
}

export function addMemory(
  text: string, carName?: string, carKey?: string, sessionId?: string,
): CoachMemoryEntry {
  const entry: CoachMemoryEntry = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    text: text.trim(),
    carName: carName?.trim() || undefined,
    carKey: carKey?.trim() || undefined,
    sessionId,
  }
  const next = load()
  next.push(entry)
  save(next)
  return entry
}

export function deleteMemory(id: string): boolean {
  save(load().filter(e => e.id !== id))
  return true
}
