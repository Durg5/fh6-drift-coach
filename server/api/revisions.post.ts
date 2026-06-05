import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR  = join(homedir(), '.config', 'drift-coach')
const FILE = join(DIR, 'revisions.json')

// Whitelist of legit tune fields. Anything else (e.g. Vue Ref internals like
// _object, _raw, __v_isRef that the client once accidentally serialised) is
// stripped before write. Defensive against the bug where a Vue Ref was spread
// into the body and embedded the entire app state into revisions.json.
const TUNE_KEYS = new Set([
  'carName', 'carMake', 'carYear', 'carModel',
  'drivetrainType', 'piClass', 'piNumber', 'tireCompound',
  'powerHp', 'weightLb', 'weightFrontPct', 'tireWidthF', 'tireWidthR',
  'aeroType', 'engineSwap', 'buildNotes', 'feel',
  'tirePressureF', 'tirePressureR',
  'springRateF', 'springRateR', 'rideHeightF', 'rideHeightR',
  'reboundF', 'reboundR', 'bumpF', 'bumpR',
  'arbF', 'arbR',
  'diffAccel', 'diffDecel',
  'camberF', 'camberR', 'casterF', 'toeF', 'toeR',
  'brakeBiasF', 'brakeForce',
  'aeroFront', 'aeroRear',
  'finalDrive',
  'gear1', 'gear2', 'gear3', 'gear4', 'gear5',
  'gear6', 'gear7', 'gear8', 'gear9', 'gear10',
])

function sanitize(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (TUNE_KEYS.has(k)) out[k] = v
  }
  return out
}

function load() {
  try { return JSON.parse(readFileSync(FILE, 'utf-8')) as unknown[] } catch { return [] }
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  if (!body?.tune) throw createError({ statusCode: 400, statusMessage: 'tune required' })

  const cleanTune = sanitize(body.tune)
  if (!Object.keys(cleanTune).length) {
    throw createError({ statusCode: 400, statusMessage: 'tune object had no recognised fields' })
  }

  mkdirSync(DIR, { recursive: true })
  const revisions = load() as { id: string; name: string; createdAt: string; tune: unknown }[]
  const entry = {
    id: Date.now().toString(),
    name: body.name || `Rev ${revisions.length + 1}`,
    createdAt: new Date().toISOString(),
    tune: cleanTune,
  }
  revisions.push(entry)
  writeFileSync(FILE, JSON.stringify(revisions, null, 2), 'utf-8')
  return entry
})
