import { addReference, type ReferenceTune } from '../utils/reference-tunes-store'

// Whitelist of legit tune fields — same as revisions POST. Strips any junk
// (Vue Ref internals, partial suggestion objects, etc.) so the saved
// reference is always a complete-enough tune for downstream code to render.
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

export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<ReferenceTune>>(event)
  if (!body?.tune || !body?.label) {
    throw createError({ statusCode: 400, statusMessage: 'label and tune required' })
  }

  const cleanTune = sanitize(body.tune)
  // Require at least the essentials so a malformed save can't pollute the library
  if (!cleanTune.springRateF || !cleanTune.gear1 || !cleanTune.tirePressureR) {
    throw createError({
      statusCode: 400,
      statusMessage: 'tune is missing required fields (springRateF, gear1, tirePressureR)',
    })
  }

  return addReference({
    label: body.label,
    notes: body.notes,
    carKey: body.carKey ?? '',
    carName: body.carName ?? '',
    carMake: body.carMake,
    carYear: body.carYear,
    carModel: body.carModel,
    drivetrainType: body.drivetrainType,
    piClass: body.piClass,
    piNumber: body.piNumber,
    tireCompound: body.tireCompound,
    tune: cleanTune,
    telemetrySummary: body.telemetrySummary,
  })
})
