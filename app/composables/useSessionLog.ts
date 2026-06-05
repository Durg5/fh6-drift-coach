import { useTune } from './useTune'
import { useSessionRecorder, type DriftSessionStats, type SpinEvent } from './useSessionRecorder'

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
  stats: DriftSessionStats
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA') + ' ' +
    d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDur(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function tuneToText(t: Record<string, unknown>): string {
  const g = (k: string) => t[k]
  const gearList = [g('gear1'), g('gear2'), g('gear3'), g('gear4'), g('gear5'),
                    g('gear6'), g('gear7'), g('gear8'), g('gear9'), g('gear10')]
  const activeGears = gearList
    .map((v, i) => ({ n: i + 1, v: Number(v) }))
    .filter(x => x.v > 0)
    .map(x => `${x.n}:${x.v.toFixed(2)}`).join(' ')
  const aeroType = String(g('aeroType') ?? 'none')
  const aeroLine = aeroType === 'splitter' ? `  7. Aero — Splitter (F) ${g('aeroFront')} lbf`
    : aeroType === 'wing'                  ? `  7. Aero — Wing (R) ${g('aeroRear')} lbf`
    : aeroType === 'both'                  ? `  7. Aero — Splitter (F) ${g('aeroFront')} / Wing (R) ${g('aeroRear')} lbf`
    : ''
  const feel = String(g('feel') ?? 'na')
  const feelLine = feel === 'na' ? '' : (
    `  Driver's FEEL rating of this tune: ${feel.toUpperCase()} — ` +
    (feel === 'good'   ? 'dialed — recommend MINOR refinements only (±5-10%).'
   : feel === 'medium' ? 'workable — MODERATE corrections on weakest signals (15-25%).'
                       : 'broken — MAJOR overhaul OK.'))
  return [
    `  Car: ${g('carName') || '?'} | ${g('drivetrainType')} | ${g('piClass')}${g('piNumber') ? ' ' + g('piNumber') : ''} | ${g('tireCompound')} tires`,
    g('powerHp')      ? `  Power: ${g('powerHp')}hp | Weight: ${g('weightLb')}lb (${g('weightFrontPct')}% front)` : '',
    g('tireWidthF')   ? `  Tire width: F ${g('tireWidthF')} / R ${g('tireWidthR')} mm` : '',
    g('engineSwap')   ? `  Engine swap: ${g('engineSwap')}` : '',
    g('buildNotes')   ? `  Build notes: ${g('buildNotes')}` : '',
    feelLine,
    `  Tune (FH6 order):`,
    `  1. Tires — F ${g('tirePressureF')} / R ${g('tirePressureR')} PSI`,
    `  2. Gearing — Final ${g('finalDrive')}${activeGears ? ' | ' + activeGears : ''}`,
    `  3. Alignment — Camber F ${g('camberF')}° / R ${g('camberR')}° | Toe F ${g('toeF')}° / R ${g('toeR')}° | Caster ${g('casterF')}°`,
    `  4. ARB — F ${g('arbF')} / R ${g('arbR')}`,
    `  5. Springs — Rate F ${g('springRateF')} / R ${g('springRateR')} lb/in | Height F ${g('rideHeightF')}" / R ${g('rideHeightR')}"`,
    `  6. Damping — Rebound F ${g('reboundF')} / R ${g('reboundR')} | Bump F ${g('bumpF')} / R ${g('bumpR')}`,
    aeroLine,
    `  8. Brake — Balance ${g('brakeBiasF')}% F | Force ${g('brakeForce')}%`,
    `  9. Differential (rear) — Accel ${g('diffAccel')}% / Decel ${g('diffDecel')}%`,
  ].filter(Boolean).join('\n')
}

function statsToText(s: DriftSessionStats): string {
  const dur = Math.round(s.durationMs / 1000)
  const topGears = Object.entries(s.gearUsageDrift)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([g, p]) => `G${g}: ${p}%`).join(', ')
  const elevRange = s.elevMax - s.elevMin
  const switchback = (s.peakGradeUpPct > 4 || s.peakGradeDownPct > 4) && elevRange > 20
  const spinLines = s.spins.length
    ? s.spins.map((sp: SpinEvent, i: number) =>
        `  Spin ${i+1} @ ${Math.round(sp.t/1000)}s — ${sp.cause}`
        + ` | speed ${sp.speedKmhBefore}→${sp.speedKmhAtEvent} km/h`
        + `, peak yaw ${sp.peakYawRate}°/s, angle ${sp.driftAngleAtEvent}°`
        + ` | lead-up: thr ${sp.throttleBefore}% brk ${sp.brakeBefore}% steer ${sp.steerBefore} hb ${sp.handbrakeBefore ? 'on' : 'off'} G${sp.gear}`
        + ` | rear/front slip ratio ${sp.rearVsFrontSlipRatio}x`
        + ` | pos (${Math.round(sp.posX)}, ${Math.round(sp.posY)}, ${Math.round(sp.posZ)})`
      ).join('\n')
    : '  (none detected)'

  return [
    `Duration: ${fmtDur(dur)} (${s.frameCount} frames)`,
    `Drift time: ${s.driftTimeSec}s (${s.driftTimePercent}% of session) | Best sustained: ${s.bestSustainedDriftSec}s`,
    `Max angle: ${s.maxDriftAngle}°, avg during drift: ${s.avgDriftAngle}°  |  Drift score: ${s.driftScore}`,
    `Speed: max ${s.maxSpeedKmh} km/h, avg ${s.avgSpeedKmh} km/h`,
    `Throttle: avg ${s.avgThrottle}% (${s.throttleConsistency})  |  Brake: avg ${s.avgBrake}%`,
    `Steering: ${s.steerConsistency} (${s.steerReversalsPerSec} reversals/s — input-device characteristic, not driver)`,
    `Handbrake entries: ${s.handbrakeEntries}  |  Counter-steer: ${s.counterSteerPercent}% of drift time  |  Snap-overs: ${s.snapOvers}`,
    `Slip balance in drift: F ${s.avgFrontCombinedSlipDrift} / R ${s.avgRearCombinedSlipDrift} (ratio ${s.avgFrontCombinedSlipDrift > 0 ? (s.avgRearCombinedSlipDrift / s.avgFrontCombinedSlipDrift).toFixed(2) : 'n/a'}x)`,
    `Tire temps °C — FL ${s.maxTireTempFL}/${s.avgTireTempFL} | FR ${s.maxTireTempFR}/${s.avgTireTempFR} | RL ${s.maxTireTempRL}/${s.avgTireTempRL} | RR ${s.maxTireTempRR}/${s.avgTireTempRR} (max/avg)`,
    `Suspension travel Δ (0-1): FL ${s.suspRangeFL} FR ${s.suspRangeFR} RL ${s.suspRangeRL} RR ${s.suspRangeRR}`,
    `Gears during drift: ${topGears || 'no data'}`,
    `Map: X ${s.posMinX}..${s.posMaxX} Z ${s.posMinZ}..${s.posMaxZ}  |  Elevation ${s.elevMin}m→${s.elevMax}m (Δ${elevRange}m, +${s.elevGain}/-${s.elevLoss}m)`,
    `Peak grade: up ${s.peakGradeUpPct}% / down ${s.peakGradeDownPct}%${switchback ? ' — switchback / mountain road' : ''}`,
    Array.isArray(s.topChains) && s.topChains.length
      ? `Top ${s.topChains.length} drift chains:\n` + s.topChains.map((c, i) =>
          `  #${i+1} @${Math.round(c.startMs/1000)}s — ${c.durationSec}s sustained, peak ${c.peakAngle}° @${c.peakSpeedKmh} km/h, score ${c.score}`
        ).join('\n')
      : '',
    `Spins (${s.spins.length}):`,
    spinLines,
  ].filter(Boolean).join('\n')
}

export const useSessionLog = () => {
  const { tune, carKey } = useTune()
  const { sessionStats } = useSessionRecorder()

  const sessions = useState<SessionIndexEntry[]>('dc-sessions', () => [])
  const selectedId = useState<string | null>('dc-session-selected', () => null)
  const selected = useState<SavedSession | null>('dc-session-loaded', () => null)
  const saving = ref(false)
  const saveFlash = ref(false)

  async function fetchList() {
    try {
      const url = carKey.value
        ? `/api/sessions?carKey=${encodeURIComponent(carKey.value)}`
        : '/api/sessions'
      sessions.value = await $fetch<SessionIndexEntry[]>(url)
    } catch { sessions.value = [] }
  }

  async function saveCurrentSession(name: string, notes?: string) {
    if (!sessionStats.value) throw new Error('no stats — record a session first')
    saving.value = true
    try {
      // Embed carKey into the snapshot so the server can index by car.
      const entry = await $fetch<SavedSession>('/api/sessions', {
        method: 'POST',
        body: {
          name: name || `Session ${new Date().toLocaleString()}`,
          notes,
          tuneSnapshot: { ...tune.value, carKey: carKey.value },
          stats: sessionStats.value,
        },
      })
      saveFlash.value = true
      setTimeout(() => { saveFlash.value = false }, 2000)
      await fetchList()
      return entry
    } finally {
      saving.value = false
    }
  }

  // Refetch whenever the active car changes — silos the visible list per car.
  watch(carKey, fetchList)

  async function selectSession(id: string | null) {
    selectedId.value = id
    if (!id) { selected.value = null; return }
    try { selected.value = await $fetch<SavedSession>(`/api/sessions/${id}`) }
    catch { selected.value = null }
  }

  async function deleteSession(id: string) {
    await $fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    if (selectedId.value === id) {
      selectedId.value = null
      selected.value = null
    }
    sessions.value = sessions.value.filter(s => s.id !== id)
  }

  const selectedAsContext = computed<string>(() => {
    const s = selected.value
    if (!s) return ''
    return [
      `SELECTED SESSION FOR ANALYSIS: "${s.name}" (${fmtDate(s.createdAt)})`,
      s.notes ? `Notes: ${s.notes}` : '',
      ``,
      `TUNE + CAR SPECS AT TIME OF RECORDING:`,
      tuneToText(s.tuneSnapshot),
      ``,
      `RECORDED SESSION STATS:`,
      statsToText(s.stats),
    ].filter(Boolean).join('\n')
  })

  onMounted(fetchList)

  return {
    sessions, selected, selectedId,
    saving, saveFlash,
    fetchList, saveCurrentSession, selectSession, deleteSession,
    selectedAsContext,
  }
}
