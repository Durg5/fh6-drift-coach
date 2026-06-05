import { useTune } from './useTune'
import { useSessionLog } from './useSessionLog'
import { useSessionRecorder } from './useSessionRecorder'

export interface ReferenceTune {
  id: string
  createdAt: string
  label: string
  notes?: string
  carKey: string
  carName: string
  carMake?: string
  carYear?: number
  carModel?: string
  drivetrainType?: string
  piClass?: string
  piNumber?: number
  tireCompound?: string
  tune: Record<string, unknown>
  telemetrySummary?: string
}

// Tiny formatter — keeps reference-library context compact so it fits next to
// session/tune/memory context without blowing token budgets.
function shortTuneLine(t: Record<string, unknown> | null | undefined): string {
  if (!t || typeof t !== 'object') return '(no tune data)'
  const g = (k: string) => t[k]
  const gearList = [g('gear1'), g('gear2'), g('gear3'), g('gear4'), g('gear5'),
                    g('gear6'), g('gear7'), g('gear8'), g('gear9'), g('gear10')]
  const gears = gearList
    .map((v, i) => ({ n: i + 1, v: Number(v) }))
    .filter(x => x.v > 0)
    .map(x => `${x.n}:${x.v.toFixed(2)}`).join(' ')
  return [
    `T F${g('tirePressureF')}/R${g('tirePressureR')} PSI`,
    `Gr Final${g('finalDrive')} ${gears}`,
    `Al cam F${g('camberF')}/R${g('camberR')} toe F${g('toeF')}/R${g('toeR')} caster${g('casterF')}`,
    `ARB F${g('arbF')}/R${g('arbR')}`,
    `Spr F${g('springRateF')}/R${g('springRateR')} ride F${g('rideHeightF')}/R${g('rideHeightR')}`,
    `Dmp rb F${g('reboundF')}/R${g('reboundR')} bp F${g('bumpF')}/R${g('bumpR')}`,
    `Br ${g('brakeBiasF')}%/${g('brakeForce')}%`,
    `Diff acc${g('diffAccel')}/dec${g('diffDecel')}`,
  ].join(' | ')
}

export const useReferenceTunes = () => {
  const { tune, carKey } = useTune()
  const { selected } = useSessionLog()
  const { getSessionAnalysis } = useSessionRecorder()

  const refs   = useState<ReferenceTune[]>('dc-references', () => [])
  const saving = ref(false)
  const flash  = ref(false)

  async function fetchAll() {
    try { refs.value = await $fetch<ReferenceTune[]>('/api/reference-tunes') }
    catch { refs.value = [] }
  }

  async function saveCurrentAsReference(label: string, notes?: string) {
    if (!label.trim()) throw new Error('label required')
    saving.value = true
    try {
      // Telemetry summary: prefer a selected saved session, fall back to
      // currently-recorded session, or omit entirely.
      let telemetrySummary: string | undefined
      if (selected.value?.stats) {
        const s = selected.value.stats as Record<string, unknown>
        const dur = Math.round(Number(s.durationMs ?? 0) / 1000)
        telemetrySummary = `From session "${selected.value.name}" (${dur}s). `
          + `Drift score ${s.driftScore}, time ${s.driftTimeSec}s (${s.driftTimePercent}%), `
          + `max angle ${s.maxDriftAngle}°, avg ${s.avgDriftAngle}°, `
          + `best sustained ${s.bestSustainedDriftSec}s, spins ${Array.isArray(s.spins) ? s.spins.length : 0}, `
          + `slip F${s.avgFrontCombinedSlipDrift}/R${s.avgRearCombinedSlipDrift}.`
      } else {
        const a = getSessionAnalysis()
        if (a) telemetrySummary = a.split('\n').slice(0, 6).join('\n')
      }

      const created = await $fetch<ReferenceTune>('/api/reference-tunes', {
        method: 'POST',
        body: {
          label: label.trim(),
          notes: notes?.trim() || undefined,
          carKey: carKey.value,
          carName: tune.carName,
          carMake: tune.carMake || undefined,
          carYear: tune.carYear || undefined,
          carModel: tune.carModel || undefined,
          drivetrainType: tune.drivetrainType,
          piClass: tune.piClass,
          piNumber: tune.piNumber || undefined,
          tireCompound: tune.tireCompound,
          tune: { ...tune },
          telemetrySummary,
        },
      })
      refs.value = [created, ...refs.value]
      flash.value = true
      setTimeout(() => { flash.value = false }, 2000)
      return created
    } finally {
      saving.value = false
    }
  }

  async function remove(id: string) {
    await $fetch(`/api/reference-tunes/${id}`, { method: 'DELETE' })
    refs.value = refs.value.filter(r => r.id !== id)
  }

  // Cross-car library, capped — provider-agnostic alternative to RAG.
  // We always include up to 12 entries, prioritising same-drivetrain matches.
  const libraryAsText = computed<string>(() => {
    if (!refs.value.length) return ''
    const here = refs.value.filter(r => r.drivetrainType === tune.drivetrainType)
    const others = refs.value.filter(r => r.drivetrainType !== tune.drivetrainType)
    const picked = [...here, ...others].slice(0, 12)
    const lines = picked.map(r => {
      const carBits = [
        r.carYear ? String(r.carYear) : '',
        r.carMake, r.carModel,
      ].filter(Boolean).join(' ') || r.carName
      const head = `■ "${r.label}" — ${carBits} | ${r.drivetrainType ?? '?'} ${r.piClass ?? ''}${r.piNumber ? ' ' + r.piNumber : ''} ${r.tireCompound ?? ''}`
      const params = shortTuneLine(r.tune)
      const tail = [
        r.notes ? `Notes: ${r.notes}` : '',
        r.telemetrySummary ? `Telemetry: ${r.telemetrySummary}` : '',
      ].filter(Boolean).join(' ')
      return [head, '  ' + params, tail ? '  ' + tail : ''].filter(Boolean).join('\n')
    })
    return [
      `REFERENCE TUNE LIBRARY (${refs.value.length} known-good baselines, showing ${picked.length}) —`,
      `These are tunes the driver has marked as DIALED. Use them as cross-car ground truth for what a working drift setup looks like in this game.`,
      `When recommending changes, REFERENCE the closest matching baseline by name and explain how your suggestion moves toward or differs from it.`,
      ``,
      ...lines,
    ].join('\n')
  })

  onMounted(fetchAll)

  return { refs, saving, flash, fetchAll, saveCurrentAsReference, remove, libraryAsText }
}
