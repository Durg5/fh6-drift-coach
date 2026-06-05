import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Reference tune library — the user's curated baseline of GOOD drift tunes.
 *
 * Each entry is a known-good tune + its session telemetry summary.
 * The AI receives ALL references in every TUNE REVIEW so it has a
 * cross-car library of what "dialed" actually looks like in numbers.
 *
 * This is a provider-agnostic alternative to vector RAG: we ship the
 * full library as text context. Works with any LLM. Capped to avoid
 * blowing context budgets.
 */

const DIR  = join(homedir(), '.config', 'drift-coach')
const FILE = join(DIR, 'reference-tunes.json')

export interface ReferenceTune {
  id: string
  createdAt: string
  label: string                       // user-given name (e.g. "R34 GTR sweet spot")
  notes?: string                      // why this tune works / what it feels like
  carKey: string
  carName: string
  carMake?: string
  carYear?: number
  carModel?: string
  drivetrainType?: string
  piClass?: string
  piNumber?: number
  tireCompound?: string
  // Full tune snapshot — same shape as Tune in useTune.ts
  tune: Record<string, unknown>
  // Optional telemetry summary from the run this reference is based on
  telemetrySummary?: string
}

function load(): ReferenceTune[] {
  try { return JSON.parse(readFileSync(FILE, 'utf-8')) as ReferenceTune[] }
  catch { return [] }
}

function save(entries: ReferenceTune[]) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export function listReferences(): ReferenceTune[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function addReference(entry: Omit<ReferenceTune, 'id' | 'createdAt'>): ReferenceTune {
  const ref: ReferenceTune = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    ...entry,
  }
  const all = load()
  all.push(ref)
  save(all)
  return ref
}

export function deleteReference(id: string): boolean {
  save(load().filter(r => r.id !== id))
  return true
}
