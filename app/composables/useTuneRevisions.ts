import { useTune } from './useTune'

export interface TuneRevision {
  id: string
  name: string
  createdAt: string
  tune: ReturnType<typeof useTune>['tune']['value']
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA') + ' ' + new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export const useTuneRevisions = () => {
  const { tune } = useTune()
  const revisions = useState<TuneRevision[]>('dc-revisions', () => [])
  const saving = ref(false)
  const saveFlash = ref(false)

  async function fetchRevisions() {
    try {
      revisions.value = await $fetch<TuneRevision[]>('/api/revisions')
    } catch {
      revisions.value = []
    }
  }

  async function saveRevision(name?: string) {
    saving.value = true
    try {
      const entry = await $fetch<TuneRevision>('/api/revisions', {
        method: 'POST',
        body: { name: name || undefined, tune: tune.value },
      })
      revisions.value = [...revisions.value, entry]
      saveFlash.value = true
      setTimeout(() => { saveFlash.value = false }, 2000)
    } finally {
      saving.value = false
    }
  }

  async function deleteRevision(id: string) {
    await $fetch(`/api/revisions/${id}`, { method: 'DELETE' })
    revisions.value = revisions.value.filter(r => r.id !== id)
  }

  // Whitelist of legit tune keys — defensive against older revisions or future
  // malformed shapes that might include junk fields. Only assign keys that
  // already exist on the current tune state.
  function loadRevision(rev: TuneRevision) {
    if (!rev?.tune || typeof rev.tune !== 'object') return
    const target = tune.value as Record<string, unknown>
    const src = rev.tune as unknown as Record<string, unknown>
    for (const k of Object.keys(target)) {
      if (k in src && src[k] !== undefined) target[k] = src[k]
    }
  }

  const tuneHistoryText = computed<string>(() => {
    if (!revisions.value.length) return ''
    const lines = revisions.value.map((r, i) => {
      // Defensive: skip a revision whose tune is missing/null. Crashed the
      // whole tune-history computed when malformed revisions snuck in.
      if (!r?.tune) return `Rev ${i + 1} — ${r?.name ?? '(unnamed)'} (no tune data)`
      const t = r.tune as Record<string, unknown> & { [k: string]: any }
      const isCurrent = i === revisions.value.length - 1
      const header = `Rev ${i + 1}${isCurrent ? ' [LATEST]' : ''} — ${r.name} (${fmtDate(r.createdAt)})`
      const gearList = [t.gear1, t.gear2, t.gear3, t.gear4, t.gear5, t.gear6, t.gear7, t.gear8, t.gear9, t.gear10]
      const activeGears = gearList.filter(Boolean).map((g, gi) => `${gi + 1}:${g}`).join(' ')
      const parts = [
        header,
        `  Car: ${t.carName || '?'} | ${t.drivetrainType} | ${t.piClass}${t.piNumber ? ' ' + t.piNumber : ''} | ${t.tireCompound}`,
        t.powerHp ? `  Power: ${t.powerHp}hp | Weight: ${t.weightLb}lb (${t.weightFrontPct}% front)` : '',
        `  Springs: F ${t.springRateF} / R ${t.springRateR} lb/in`,
        `  Bump: F ${t.bumpF} / R ${t.bumpR}  |  Rebound: F ${t.reboundF} / R ${t.reboundR}`,
        `  ARB: F ${t.arbF} / R ${t.arbR}`,
        `  Diff: Accel ${t.diffAccel}% / Decel ${t.diffDecel}%`,
        `  Camber: F ${t.camberF}° / R ${t.camberR}°  |  Caster: ${t.casterF}°  |  Toe: F ${t.toeF}° / R ${t.toeR}°`,
        `  Tire PSI: F ${t.tirePressureF} / R ${t.tirePressureR}`,
        `  Brakes: ${t.brakeBiasF}% front / ${t.brakeForce}% force`,
        `  Aero: F ${t.aeroFront} / R ${t.aeroRear}  |  Final: ${t.finalDrive}`,
        activeGears ? `  Gears: ${activeGears}` : '',
        t.buildNotes ? `  Notes: ${t.buildNotes}` : '',
      ].filter(Boolean)
      return parts.join('\n')
    })
    return `Tune revision history (${revisions.value.length} saved):\n\n${lines.join('\n\n')}`
  })

  onMounted(fetchRevisions)

  return { revisions, saving, saveFlash, fetchRevisions, saveRevision, deleteRevision, loadRevision, tuneHistoryText }
}
