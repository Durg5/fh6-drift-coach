import type { ForzaTelemetry } from '../../shared/telemetry-types'

export interface DriftFrame {
  t: number
  // Position / elevation
  posX: number
  posY: number        // elevation
  posZ: number
  // Motion
  speedKmh: number
  velX: number; velY: number; velZ: number
  accelX: number; accelY: number; accelZ: number
  angVelX: number; angVelY: number; angVelZ: number
  yaw: number; pitch: number; roll: number
  // Engine + inputs (controller is choppy by nature)
  rpm: number
  throttle: number    // 0-255
  brake: number
  clutch: number
  steer: number       // -127 to 127
  handbrake: boolean
  gear: number
  // Drift state
  driftAngle: number  // degrees (0 when ~stationary)
  rearSlipAngle: number      // normalized 0-1
  frontCombinedSlip: number  // normalized 0-1
  rearCombinedSlip: number   // normalized 0-1
  isDrifting: boolean
  yawRate: number     // deg/s
  counterSteer: boolean
  // Per-corner tire + susp + slip ratio
  tireTempFL: number; tireTempFR: number; tireTempRL: number; tireTempRR: number
  suspFL: number; suspFR: number; suspRL: number; suspRR: number
  slipRatioFL: number; slipRatioFR: number; slipRatioRL: number; slipRatioRR: number
  wheelSpdFL: number; wheelSpdFR: number; wheelSpdRL: number; wheelSpdRR: number
}

export interface SpinEvent {
  t: number            // ms since session start
  posX: number; posY: number; posZ: number
  speedKmhBefore: number
  speedKmhAtEvent: number
  peakYawRate: number  // deg/s
  driftAngleAtEvent: number
  throttleBefore: number    // 0-100%
  brakeBefore: number
  steerBefore: number       // -127..127
  handbrakeBefore: boolean
  gear: number
  rearVsFrontSlipRatio: number  // rear / max(front, 0.01)
  cause: string        // best-guess label
}

export interface DriftSessionStats {
  durationMs: number
  frameCount: number
  // Speed
  maxSpeedKmh: number
  avgSpeedKmh: number
  // Drift angle
  maxDriftAngle: number
  avgDriftAngle: number       // only when drifting
  totalDriftFrames: number
  driftTimeSec: number
  driftTimePercent: number
  // Inputs
  avgThrottle: number         // 0-100%
  avgBrake: number
  throttleConsistency: string // smooth/moderate/choppy
  steerConsistency: string    // smooth/moderate/choppy (controller users skew choppy)
  steerReversalsPerSec: number
  // Technique
  handbrakeEntries: number
  counterSteerPercent: number // % of drift frames with counter-steer
  snapOvers: number           // sudden yaw-rate direction reversals
  spins: SpinEvent[]
  // Map / elevation
  posMinX: number; posMaxX: number
  posMinZ: number; posMaxZ: number
  elevMin: number; elevMax: number
  elevGain: number; elevLoss: number
  peakGradeUpPct: number; peakGradeDownPct: number
  // Front/rear balance (avg during drift)
  avgFrontCombinedSlipDrift: number
  avgRearCombinedSlipDrift: number
  // Tire heat (all 4 corners)
  maxTireTempFL: number; maxTireTempFR: number
  maxTireTempRL: number; maxTireTempRR: number
  avgTireTempFL: number; avgTireTempFR: number
  avgTireTempRL: number; avgTireTempRR: number
  // Suspension travel range (compression delta)
  suspRangeFL: number; suspRangeFR: number
  suspRangeRL: number; suspRangeRR: number
  // Drift score (angle × duration, weighted by speed)
  driftScore: number
  bestSustainedDriftSec: number
  // Top chains — longest/highest-scoring sustained drifts within the session
  topChains: DriftChain[]
  // Gear usage during drift
  gearUsageDrift: Record<number, number>
}

export interface DriftChain {
  startMs: number       // ms since session start
  endMs: number
  durationSec: number
  peakAngle: number     // °
  avgAngle: number      // °
  peakSpeedKmh: number
  avgSpeedKmh: number
  score: number         // angle × speed/100 × duration
  startPos: { x: number; y: number; z: number }
  endPos:   { x: number; y: number; z: number }
}

const ROLLING_MAX = 1800  // 60s at 30fps (30 packets/s)

// Module-level buffers — shared across all composable instances
let _buf: DriftFrame[] = []
let _rolling: DriftFrame[] = []
let _rollingWatchStop: (() => void) | null = null
let _rollingLastT = 0

function frameFrom(t: ForzaTelemetry, now: number): DriftFrame {
  return {
    t: now,
    posX: t.posX, posY: t.posY, posZ: t.posZ,
    speedKmh: t.speedKmh,
    velX: t.velX, velY: t.velY, velZ: t.velZ,
    accelX: t.accelX, accelY: t.accelY, accelZ: t.accelZ,
    angVelX: t.angVelX, angVelY: t.angVelY, angVelZ: t.angVelZ,
    yaw: t.yaw, pitch: t.pitch, roll: t.roll,
    rpm: t.currentEngineRpm,
    throttle: t.throttle, brake: t.brake, clutch: t.clutch,
    steer: t.steer, handbrake: t.handbrake, gear: t.gear,
    driftAngle: t.driftAngleDeg,
    rearSlipAngle: t.rearSlipAngleDeg,
    frontCombinedSlip: t.frontCombinedSlip,
    rearCombinedSlip: t.rearCombinedSlip,
    isDrifting: t.isDrifting,
    yawRate: t.yawRateDegS,
    counterSteer: t.counterSteer,
    tireTempFL: t.tireTempC.fl, tireTempFR: t.tireTempC.fr,
    tireTempRL: t.tireTempC.rl, tireTempRR: t.tireTempC.rr,
    suspFL: t.suspNorm.fl, suspFR: t.suspNorm.fr,
    suspRL: t.suspNorm.rl, suspRR: t.suspNorm.rr,
    slipRatioFL: t.slipRatio.fl, slipRatioFR: t.slipRatio.fr,
    slipRatioRL: t.slipRatio.rl, slipRatioRR: t.slipRatio.rr,
    wheelSpdFL: t.wheelSpeed.fl, wheelSpdFR: t.wheelSpeed.fr,
    wheelSpdRL: t.wheelSpeed.rl, wheelSpdRR: t.wheelSpeed.rr,
  }
}

export function useSessionRecorder() {
  const isRecording       = useState<boolean>('dc.recording', () => false)
  const isPaused          = useState<boolean>('dc.paused', () => false)
  const frameCount        = useState<number>('dc.frameCount', () => 0)
  const elapsed           = useState<number>('dc.elapsed', () => 0)
  const startTime         = useState<number>('dc.startTime', () => 0)
  const sessionStats      = useState<DriftSessionStats | null>('dc.stats', () => null)
  const rollingFrameCount = useState<number>('dc.rollingCount', () => 0)

  const { telemetry } = useTelemetry()

  // Rolling buffer — always active client-side
  if (import.meta.client && !_rollingWatchStop) {
    _rollingWatchStop = watch(telemetry, (t) => {
      if (!t) return
      const now = Date.now()
      if (now - _rollingLastT < 33) return  // ~30fps cap
      _rollingLastT = now
      _rolling.push(frameFrom(t, now))
      if (_rolling.length > ROLLING_MAX) _rolling.splice(0, _rolling.length - ROLLING_MAX)
      rollingFrameCount.value = _rolling.length
    })
  }

  let stopWatch: (() => void) | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null
  let pauseCheckTimer: ReturnType<typeof setInterval> | null = null
  let lastCapture = 0

  // ── Auto-pause: detect telemetry stall (game paused / rewind / Forza menu)
  // and freeze the elapsed clock so the saved session reflects ACTUAL drive
  // time, not wall-clock. Panels keep showing the last known frame so the
  // user still sees data while paused.
  // gap >1.0s → paused, frames returning → resume + accumulate paused time
  const PAUSE_GAP_MS = 1000
  let lastFrameMs = 0
  let pauseStartMs = 0
  let pausedAccumMs = 0
  function currentElapsedMs(): number {
    const now = Date.now()
    const live = isPaused.value ? (now - pauseStartMs) : 0
    return Math.max(0, now - startTime.value - pausedAccumMs - live)
  }

  function startRecording() {
    if (isRecording.value) return
    _buf = []
    frameCount.value = 0
    sessionStats.value = null
    startTime.value = Date.now()
    elapsed.value = 0
    lastCapture = 0
    pausedAccumMs = 0
    pauseStartMs = 0
    lastFrameMs = Date.now()
    isPaused.value = false
    isRecording.value = true

    if (!import.meta.client) return

    stopWatch = watch(telemetry, (t) => {
      if (!t || !isRecording.value) return
      const now = Date.now()

      // Telemetry just resumed after a pause — close the gap and reset state.
      if (isPaused.value) {
        pausedAccumMs += now - pauseStartMs
        isPaused.value = false
      }
      lastFrameMs = now

      if (now - lastCapture < 33) return
      lastCapture = now
      _buf.push(frameFrom(t, now))
      frameCount.value = _buf.length
    })

    elapsedTimer = setInterval(() => {
      elapsed.value = currentElapsedMs()
    }, 500)

    // Pause detector — checks every 250ms whether frames have stalled.
    pauseCheckTimer = setInterval(() => {
      if (!isRecording.value || isPaused.value) return
      if (Date.now() - lastFrameMs > PAUSE_GAP_MS) {
        // Backdate pauseStart to when frames actually stopped (minus the gap)
        pauseStartMs = lastFrameMs + PAUSE_GAP_MS
        isPaused.value = true
      }
    }, 250)
  }

  function stopRecording() {
    // Close any in-flight pause window so calcStats has correct duration.
    if (isPaused.value) {
      pausedAccumMs += Date.now() - pauseStartMs
      isPaused.value = false
    }
    isRecording.value = false
    if (stopWatch) { stopWatch(); stopWatch = null }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
    if (pauseCheckTimer) { clearInterval(pauseCheckTimer); pauseCheckTimer = null }
    sessionStats.value = calcStats(_buf, startTime.value)
  }

  function exportSession() {
    if (!import.meta.client || !_buf.length) return
    const blob = new Blob([JSON.stringify({ stats: sessionStats.value, frames: _buf }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `drift-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  // Clear the recorded buffer + stats so the panel reverts to its pre-recording state
  function resetSession() {
    _buf = []
    frameCount.value = 0
    sessionStats.value = null
    elapsed.value = 0
    startTime.value = 0
    isPaused.value = false
    pausedAccumMs = 0
    pauseStartMs = 0
  }

  function getRollingAnalysis(): string {
    const frames = _rolling
    if (frames.length < 10) return ''

    const n = frames.length
    const windowMs = frames.at(-1)!.t - frames[0]!.t
    const windowSec = Math.round(windowMs / 1000)
    const driftFrames = frames.filter(f => f.isDrifting)
    const nd = driftFrames.length

    let sumSpeed = 0, sumThrottle = 0, sumBrake = 0, maxSpeed = 0, maxAngle = 0
    let maxYawRate = 0, sumYawRate = 0
    const gearCount: Record<number, number> = {}
    let snapOvers = 0, prevYaw = 0
    let tireSumRL = 0, tireSumRR = 0, counterCount = 0, hbCount = 0
    let frontSlipDrift = 0, rearSlipDrift = 0, driftFrameCount = 0
    let elevMin = Infinity, elevMax = -Infinity
    let curElev = frames.at(-1)!.posY

    for (const f of frames) {
      sumSpeed    += f.speedKmh
      sumThrottle += f.throttle
      sumBrake    += f.brake
      tireSumRL   += f.tireTempRL
      tireSumRR   += f.tireTempRR
      if (f.posY < elevMin) elevMin = f.posY
      if (f.posY > elevMax) elevMax = f.posY
      if (f.speedKmh > maxSpeed)           maxSpeed = f.speedKmh
      if (Math.abs(f.driftAngle) > maxAngle) maxAngle = Math.abs(f.driftAngle)
      const absYaw = Math.abs(f.yawRate)
      sumYawRate += absYaw
      if (absYaw > maxYawRate) maxYawRate = absYaw
      if (f.isDrifting) {
        driftFrameCount++
        frontSlipDrift += f.frontCombinedSlip
        rearSlipDrift  += f.rearCombinedSlip
        gearCount[f.gear] = (gearCount[f.gear] ?? 0) + 1
        if (f.counterSteer) counterCount++
        if (f.handbrake) hbCount++
        if (prevYaw !== 0 && Math.sign(f.yawRate) !== Math.sign(prevYaw) && absYaw > 20) snapOvers++
        prevYaw = f.yawRate
      }
    }

    const avgSpeed    = Math.round(sumSpeed / n)
    const avgThrottle = Math.round((sumThrottle / n) / 2.55)  // to %
    const avgBrake    = Math.round((sumBrake / n) / 2.55)
    const avgTireRL   = Math.round(tireSumRL / n)
    const avgTireRR   = Math.round(tireSumRR / n)
    const driftPct    = Math.round((nd / n) * 100)
    const counterPct  = nd > 0 ? Math.round((counterCount / nd) * 100) : 0

    const tVar    = frames.reduce((s, f) => s + (f.throttle / 2.55 - avgThrottle) ** 2, 0) / n
    const tStdDev = Math.round(Math.sqrt(tVar))
    const tStyle  = tStdDev < 12 ? 'smooth' : tStdDev < 22 ? 'moderate' : 'choppy'

    const avgDriftAngle = nd > 0
      ? Math.round(driftFrames.reduce((s, f) => s + Math.abs(f.driftAngle), 0) / nd)
      : 0

    const topGears = Object.entries(gearCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([g, c]) => `G${g}: ${Math.round((c / nd) * 100)}%`).join(', ')

    const tireStatus = (t: number) =>
      t < 50 ? 'cold' : t < 80 ? 'warm' : t < 100 ? 'optimal' : 'overheating'

    const min = Math.floor(windowSec / 60), sec = windowSec % 60

    const elevSpan = elevMin === Infinity ? 0 : Math.round(elevMax - elevMin)
    const fSlip = driftFrameCount > 0 ? frontSlipDrift / driftFrameCount : 0
    const rSlip = driftFrameCount > 0 ? rearSlipDrift  / driftFrameCount : 0
    const slipRatio = fSlip > 0 ? (rSlip / fSlip).toFixed(2) : 'n/a'

    return [
      `ROLLING DRIFT TELEMETRY — Last ${min}m ${sec}s (${n} frames)`,
      `Speed: avg ${avgSpeed} km/h, peak ${Math.round(maxSpeed)} km/h`,
      `Drift: ${driftPct}% of time, avg angle ${avgDriftAngle}°, peak ${Math.round(maxAngle)}°`,
      `Front/rear slip in drift: F ${fSlip.toFixed(2)} / R ${rSlip.toFixed(2)} (ratio ${slipRatio}x)`,
      `Yaw: avg ${Math.round(sumYawRate / n)}°/s, peak ${Math.round(maxYawRate)}°/s, ${snapOvers} snap-oversteer events`,
      `Throttle: avg ${avgThrottle}%, style: ${tStyle} (σ ${tStdDev}%)`,
      `Brake: avg ${avgBrake}%`,
      `Counter-steer quality: ${counterPct}% of drift frames`,
      `Handbrake entries in window: ${hbCount}`,
      `Gears during drift: ${topGears || 'none'}`,
      `Rear tire temps: RL ${avgTireRL}°C (${tireStatus(avgTireRL)}), RR ${avgTireRR}°C (${tireStatus(avgTireRR)})`,
      `Current elevation: ${Math.round(curElev)}m (window range ${elevSpan}m)`,
    ].join('\n')
  }

  function getSessionAnalysis(): string {
    const s = sessionStats.value
    if (!s) return ''
    const dur = Math.round(s.durationMs / 1000)
    const topGears = Object.entries(s.gearUsageDrift)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([g, p]) => `G${g}: ${p}%`).join(', ')

    const mapSpanX = s.posMaxX - s.posMinX
    const mapSpanZ = s.posMaxZ - s.posMinZ
    const elevRange = s.elevMax - s.elevMin
    const switchback = (s.peakGradeUpPct > 4 || s.peakGradeDownPct > 4) && elevRange > 20

    const spinLines = s.spins.length
      ? s.spins.map((sp, i) =>
          `  Spin ${i+1} @ ${Math.round(sp.t/1000)}s — ${sp.cause}`
          + `  | speed ${sp.speedKmhBefore}→${sp.speedKmhAtEvent} km/h`
          + `, peak yaw ${sp.peakYawRate}°/s, angle ${sp.driftAngleAtEvent}°`
          + ` | lead-up: thr ${sp.throttleBefore}% brk ${sp.brakeBefore}% steer ${sp.steerBefore} hb ${sp.handbrakeBefore ? 'on' : 'off'} G${sp.gear}`
          + ` | rear/front slip ratio ${sp.rearVsFrontSlipRatio}x`
          + ` | pos (${Math.round(sp.posX)}, ${Math.round(sp.posY)}, ${Math.round(sp.posZ)})`
        ).join('\n')
      : '  (none detected)'

    return [
      `SESSION ANALYSIS (${Math.floor(dur / 60)}m ${dur % 60}s, ${s.frameCount} frames)`,
      `Drift time: ${s.driftTimeSec}s (${s.driftTimePercent}% of session)`,
      `Best sustained drift: ${s.bestSustainedDriftSec}s`,
      s.topChains.length
        ? `Top drift chains: ${s.topChains.map((c, i) =>
            `#${i+1} @${Math.round(c.startMs/1000)}s — ${c.durationSec}s, peak ${c.peakAngle}° @${c.peakSpeedKmh}km/h, score ${c.score}`
          ).join(' | ')}`
        : '',
      `Max drift angle: ${s.maxDriftAngle}°, avg during drift: ${s.avgDriftAngle}°`,
      `Drift score: ${s.driftScore}`,
      `Speed: max ${s.maxSpeedKmh} km/h, avg ${s.avgSpeedKmh} km/h`,
      `Throttle: avg ${s.avgThrottle}%, style: ${s.throttleConsistency}`,
      `Steering: ${s.steerConsistency} (${s.steerReversalsPerSec} reversals/s — controller input is naturally choppy, don't read this as driver inconsistency)`,
      `Brake: avg ${s.avgBrake}%`,
      `Handbrake entries: ${s.handbrakeEntries}`,
      `Counter-steer quality: ${s.counterSteerPercent}% of drift time`,
      `Snap-oversteer events: ${s.snapOvers}`,
      `Front/rear slip balance during drift: F ${s.avgFrontCombinedSlipDrift} / R ${s.avgRearCombinedSlipDrift} (ratio ${s.avgFrontCombinedSlipDrift > 0 ? (s.avgRearCombinedSlipDrift / s.avgFrontCombinedSlipDrift).toFixed(2) : 'n/a'}x — higher = more rear-biased slide)`,
      `Tire temps °C — FL max ${s.maxTireTempFL}/avg ${s.avgTireTempFL} | FR max ${s.maxTireTempFR}/avg ${s.avgTireTempFR} | RL max ${s.maxTireTempRL}/avg ${s.avgTireTempRL} | RR max ${s.maxTireTempRR}/avg ${s.avgTireTempRR}`,
      `Suspension travel range (compression Δ, 0-1) — FL ${s.suspRangeFL} FR ${s.suspRangeFR} RL ${s.suspRangeRL} RR ${s.suspRangeRR}`,
      `Gears during drift: ${topGears || 'no data'}`,
      ``,
      `MAP / ELEVATION`,
      `  Position bounds: X ${s.posMinX}..${s.posMaxX} (span ${Math.round(mapSpanX)}m), Z ${s.posMinZ}..${s.posMaxZ} (span ${Math.round(mapSpanZ)}m)`,
      `  Elevation: ${s.elevMin}m → ${s.elevMax}m (range ${elevRange}m), gain ${s.elevGain}m, loss ${s.elevLoss}m`,
      `  Peak grade: up ${s.peakGradeUpPct}% / down ${s.peakGradeDownPct}%${switchback ? ' — looks like switchback / mountain road' : ''}`,
      ``,
      `SPIN EVENTS (${s.spins.length})`,
      spinLines,
    ].join('\n')
  }

  const elapsedFormatted = computed(() => {
    const s = Math.floor(elapsed.value / 1000)
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  })

  const rollingWindowFormatted = computed(() => {
    if (!_rolling.length) return '0s'
    const ms = _rolling.at(-1)!.t - _rolling[0]!.t
    const s  = Math.round(ms / 1000)
    const m  = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
  })

  return {
    isRecording, isPaused, frameCount, elapsed, elapsedFormatted,
    sessionStats, rollingFrameCount, rollingWindowFormatted,
    startRecording, stopRecording, exportSession, resetSession,
    getRollingAnalysis, getSessionAnalysis,
  }
}

function emptyStats(): DriftSessionStats {
  return {
    durationMs: 0, frameCount: 0,
    maxSpeedKmh: 0, avgSpeedKmh: 0,
    maxDriftAngle: 0, avgDriftAngle: 0, totalDriftFrames: 0,
    driftTimeSec: 0, driftTimePercent: 0,
    avgThrottle: 0, avgBrake: 0,
    throttleConsistency: 'n/a', steerConsistency: 'n/a', steerReversalsPerSec: 0,
    handbrakeEntries: 0, counterSteerPercent: 0, snapOvers: 0,
    spins: [],
    posMinX: 0, posMaxX: 0, posMinZ: 0, posMaxZ: 0,
    elevMin: 0, elevMax: 0, elevGain: 0, elevLoss: 0,
    peakGradeUpPct: 0, peakGradeDownPct: 0,
    avgFrontCombinedSlipDrift: 0, avgRearCombinedSlipDrift: 0,
    maxTireTempFL: 0, maxTireTempFR: 0, maxTireTempRL: 0, maxTireTempRR: 0,
    avgTireTempFL: 0, avgTireTempFR: 0, avgTireTempRL: 0, avgTireTempRR: 0,
    suspRangeFL: 0, suspRangeFR: 0, suspRangeRL: 0, suspRangeRR: 0,
    driftScore: 0, bestSustainedDriftSec: 0, topChains: [], gearUsageDrift: {},
  }
}

// Detect spin events. A spin = sustained high yaw rate with collapsing forward speed,
// OR backward velocity, OR extreme body-slip angle > 60°.
// Walks forward, collapses consecutive trouble frames into one event, snapshots inputs ~0.5s prior.
function detectSpins(frames: DriftFrame[], start: number): SpinEvent[] {
  const events: SpinEvent[] = []
  let i = 0
  const LEAD_FRAMES = 15  // ~0.5s @ 30fps
  while (i < frames.length) {
    const f = frames[i]!
    const absYaw = Math.abs(f.yawRate)
    const backward = f.velZ < -2  // ~7 km/h backward in local frame
    const wildAngle = Math.abs(f.driftAngle) > 60
    const trouble = absYaw > 90 || backward || wildAngle
    if (!trouble) { i++; continue }

    // Find end of event (back to controlled state for >0.3s)
    let j = i, peakYaw = absYaw, minSpd = f.speedKmh, peakAng = Math.abs(f.driftAngle)
    let calmRun = 0
    while (j < frames.length && calmRun < 9) {
      const g = frames[j]!
      const ay = Math.abs(g.yawRate)
      if (ay > peakYaw) peakYaw = ay
      if (g.speedKmh < minSpd) minSpd = g.speedKmh
      if (Math.abs(g.driftAngle) > peakAng) peakAng = Math.abs(g.driftAngle)
      if (ay < 40 && g.velZ > 0 && Math.abs(g.driftAngle) < 30) calmRun++
      else calmRun = 0
      j++
    }

    const lead = frames[Math.max(0, i - LEAD_FRAMES)]!
    const startSpeed = lead.speedKmh
    const rear = (Math.abs(lead.rearCombinedSlip) + f.rearCombinedSlip) / 2
    const front = Math.max((Math.abs(lead.frontCombinedSlip) + f.frontCombinedSlip) / 2, 0.01)

    let cause = 'unknown'
    if (backward) cause = 'spun backward'
    else if (lead.handbrake) cause = 'handbrake over-rotation'
    else if (lead.throttle / 2.55 > 70 && rear > front * 1.5) cause = 'power oversteer (throttle too aggressive)'
    else if (lead.brake / 2.55 > 30 && Math.abs(lead.driftAngle) > 15) cause = 'trail-brake oversteer'
    else if (Math.abs(lead.steer) > 80 && Math.abs(f.yawRate) > 120) cause = 'snap from over-correction'
    else if (peakAng > 70) cause = 'lost angle (rotation exceeded counter-steer)'
    else if (rear > front * 2) cause = 'rear grip collapse'

    events.push({
      t: f.t - start,
      posX: f.posX, posY: f.posY, posZ: f.posZ,
      speedKmhBefore: Math.round(startSpeed),
      speedKmhAtEvent: Math.round(minSpd),
      peakYawRate: Math.round(peakYaw),
      driftAngleAtEvent: Math.round(peakAng),
      throttleBefore: Math.round(lead.throttle / 2.55),
      brakeBefore: Math.round(lead.brake / 2.55),
      steerBefore: lead.steer,
      handbrakeBefore: lead.handbrake,
      gear: lead.gear,
      rearVsFrontSlipRatio: Math.round((rear / front) * 10) / 10,
      cause,
    })
    i = j
  }
  return events
}

// Extract the top N drift chains from a session. A "chain" is a contiguous
// run of isDrifting frames. We score by `angle × speed/100 × duration` to
// match the global drift-score formula, then keep the top N by score.
function detectChains(frames: DriftFrame[], start: number, n = 3): DriftChain[] {
  const chains: DriftChain[] = []
  let i = 0
  while (i < frames.length) {
    if (!frames[i]!.isDrifting) { i++; continue }
    // Walk forward until drift breaks for at least 6 frames (~0.2s tolerance)
    const startIdx = i
    let j = i, breakRun = 0
    while (j < frames.length && breakRun < 6) {
      if (frames[j]!.isDrifting) breakRun = 0
      else breakRun++
      j++
    }
    const endIdx = j - breakRun - 1
    const len = endIdx - startIdx + 1
    if (len >= 9) {  // require ~0.3s minimum
      let sumA = 0, sumS = 0, maxA = 0, maxS = 0, score = 0
      for (let k = startIdx; k <= endIdx; k++) {
        const f = frames[k]!
        const ang = Math.abs(f.driftAngle)
        sumA += ang; sumS += f.speedKmh
        if (ang > maxA) maxA = ang
        if (f.speedKmh > maxS) maxS = f.speedKmh
        score += ang * (f.speedKmh / 100) * 0.033
      }
      const sFr = frames[startIdx]!, eFr = frames[endIdx]!
      chains.push({
        startMs: sFr.t - start,
        endMs: eFr.t - start,
        durationSec: Math.round((eFr.t - sFr.t) / 100) / 10,
        peakAngle: Math.round(maxA * 10) / 10,
        avgAngle: Math.round((sumA / len) * 10) / 10,
        peakSpeedKmh: Math.round(maxS),
        avgSpeedKmh: Math.round(sumS / len),
        score: Math.round(score),
        startPos: { x: sFr.posX, y: sFr.posY, z: sFr.posZ },
        endPos:   { x: eFr.posX, y: eFr.posY, z: eFr.posZ },
      })
    }
    i = j
  }
  return chains
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

function calcStats(frames: DriftFrame[], start: number): DriftSessionStats {
  const n = frames.length
  if (!n) return emptyStats()

  const durationMs = frames.at(-1)!.t - start
  let sumSpeed = 0, sumThrottle = 0, sumBrake = 0
  let maxSpeed = 0, maxAngle = 0
  let sumTFL = 0, sumTFR = 0, sumTRL = 0, sumTRR = 0
  let maxTFL = 0, maxTFR = 0, maxTRL = 0, maxTRR = 0
  let minSFL = 1, maxSFL = 0, minSFR = 1, maxSFR = 0
  let minSRL = 1, maxSRL = 0, minSRR = 1, maxSRR = 0
  let totalDrift = 0, counterCount = 0, hbEntries = 0, snapOvers = 0
  const gearTotal: Record<number, number> = {}
  let prevHb = false, prevYaw = 0
  let curDrift = 0, bestDrift = 0, sumDriftAngle = 0
  let driftScore = 0
  let sumFrontSlipDrift = 0, sumRearSlipDrift = 0

  let posMinX = Infinity, posMaxX = -Infinity
  let posMinZ = Infinity, posMaxZ = -Infinity
  let elevMin = Infinity, elevMax = -Infinity
  let elevGain = 0, elevLoss = 0
  let peakGradeUp = 0, peakGradeDown = 0
  let prevY = frames[0]!.posY
  let prevPlanar = { x: frames[0]!.posX, z: frames[0]!.posZ }

  let steerReversals = 0
  let prevSteerSign = 0

  for (const f of frames) {
    sumSpeed    += f.speedKmh
    sumThrottle += f.throttle
    sumBrake    += f.brake
    sumTFL += f.tireTempFL; sumTFR += f.tireTempFR
    sumTRL += f.tireTempRL; sumTRR += f.tireTempRR
    if (f.speedKmh > maxSpeed) maxSpeed = f.speedKmh
    if (Math.abs(f.driftAngle) > maxAngle) maxAngle = Math.abs(f.driftAngle)
    if (f.tireTempFL > maxTFL) maxTFL = f.tireTempFL
    if (f.tireTempFR > maxTFR) maxTFR = f.tireTempFR
    if (f.tireTempRL > maxTRL) maxTRL = f.tireTempRL
    if (f.tireTempRR > maxTRR) maxTRR = f.tireTempRR

    if (f.suspFL < minSFL) minSFL = f.suspFL; if (f.suspFL > maxSFL) maxSFL = f.suspFL
    if (f.suspFR < minSFR) minSFR = f.suspFR; if (f.suspFR > maxSFR) maxSFR = f.suspFR
    if (f.suspRL < minSRL) minSRL = f.suspRL; if (f.suspRL > maxSRL) maxSRL = f.suspRL
    if (f.suspRR < minSRR) minSRR = f.suspRR; if (f.suspRR > maxSRR) maxSRR = f.suspRR

    if (f.posX < posMinX) posMinX = f.posX
    if (f.posX > posMaxX) posMaxX = f.posX
    if (f.posZ < posMinZ) posMinZ = f.posZ
    if (f.posZ > posMaxZ) posMaxZ = f.posZ
    if (f.posY < elevMin) elevMin = f.posY
    if (f.posY > elevMax) elevMax = f.posY

    const dy = f.posY - prevY
    const dxz = Math.hypot(f.posX - prevPlanar.x, f.posZ - prevPlanar.z)
    if (dxz > 0.5) {
      const grade = (dy / dxz) * 100
      if (grade > peakGradeUp)   peakGradeUp = grade
      if (grade < -peakGradeDown) peakGradeDown = -grade
      if (dy > 0) elevGain += dy; else elevLoss += -dy
      prevPlanar = { x: f.posX, z: f.posZ }
    }
    prevY = f.posY

    const ss = Math.sign(f.steer)
    if (ss !== 0 && prevSteerSign !== 0 && ss !== prevSteerSign) steerReversals++
    if (ss !== 0) prevSteerSign = ss

    if (f.isDrifting) {
      totalDrift++
      sumDriftAngle += Math.abs(f.driftAngle)
      sumFrontSlipDrift += f.frontCombinedSlip
      sumRearSlipDrift  += f.rearCombinedSlip
      if (f.counterSteer) counterCount++
      gearTotal[f.gear] = (gearTotal[f.gear] ?? 0) + 1
      curDrift += 0.033
      driftScore += Math.abs(f.driftAngle) * (f.speedKmh / 100) * 0.033
      const absYaw = Math.abs(f.yawRate)
      if (prevYaw !== 0 && Math.sign(f.yawRate) !== Math.sign(prevYaw) && absYaw > 20) snapOvers++
      prevYaw = f.yawRate
    } else {
      if (curDrift > bestDrift) bestDrift = curDrift
      curDrift = 0
      prevYaw = 0
    }

    if (f.handbrake && !prevHb) hbEntries++
    prevHb = f.handbrake
  }
  if (curDrift > bestDrift) bestDrift = curDrift

  const avgThrottlePct = Math.round((sumThrottle / n) / 2.55)
  const tVar  = frames.reduce((s, f) => s + (f.throttle / 2.55 - avgThrottlePct) ** 2, 0) / n
  const tStd  = Math.round(Math.sqrt(tVar))
  const tStyle = tStd < 12 ? 'smooth' : tStd < 22 ? 'moderate' : 'choppy'

  const avgSteer = frames.reduce((s, f) => s + f.steer, 0) / n
  const sVar = frames.reduce((s, f) => s + (f.steer - avgSteer) ** 2, 0) / n
  const sStd = Math.sqrt(sVar)
  const sStyle = sStd < 15 ? 'smooth' : sStd < 35 ? 'moderate' : 'choppy'

  const totalGearFrames = Object.values(gearTotal).reduce((s, c) => s + c, 0) || 1
  const gearUsagePct: Record<number, number> = {}
  for (const [g, c] of Object.entries(gearTotal)) {
    gearUsagePct[Number(g)] = Math.round((c / totalGearFrames) * 100)
  }

  const spins = detectSpins(frames, start)
  const topChains = detectChains(frames, start, 3)
  const sec = Math.max(durationMs / 1000, 0.001)

  if (elevMin === Infinity) { elevMin = 0; elevMax = 0 }
  if (posMinX === Infinity) { posMinX = 0; posMaxX = 0 }
  if (posMinZ === Infinity) { posMinZ = 0; posMaxZ = 0 }

  return {
    durationMs,
    frameCount: n,
    maxSpeedKmh: Math.round(maxSpeed),
    avgSpeedKmh: Math.round(sumSpeed / n),
    maxDriftAngle: Math.round(maxAngle * 10) / 10,
    avgDriftAngle: totalDrift > 0 ? Math.round((sumDriftAngle / totalDrift) * 10) / 10 : 0,
    totalDriftFrames: totalDrift,
    driftTimeSec: Math.round(totalDrift * 0.033 * 10) / 10,
    driftTimePercent: Math.round((totalDrift / n) * 100),
    avgThrottle: avgThrottlePct,
    avgBrake: Math.round((sumBrake / n) / 2.55),
    throttleConsistency: tStyle,
    steerConsistency: sStyle,
    steerReversalsPerSec: Math.round((steerReversals / sec) * 10) / 10,
    handbrakeEntries: hbEntries,
    counterSteerPercent: totalDrift > 0 ? Math.round((counterCount / totalDrift) * 100) : 0,
    snapOvers,
    spins,
    posMinX: Math.round(posMinX), posMaxX: Math.round(posMaxX),
    posMinZ: Math.round(posMinZ), posMaxZ: Math.round(posMaxZ),
    elevMin: Math.round(elevMin), elevMax: Math.round(elevMax),
    elevGain: Math.round(elevGain), elevLoss: Math.round(elevLoss),
    peakGradeUpPct:   Math.round(peakGradeUp * 10) / 10,
    peakGradeDownPct: Math.round(peakGradeDown * 10) / 10,
    avgFrontCombinedSlipDrift: totalDrift > 0
      ? Math.round((sumFrontSlipDrift / totalDrift) * 100) / 100 : 0,
    avgRearCombinedSlipDrift:  totalDrift > 0
      ? Math.round((sumRearSlipDrift  / totalDrift) * 100) / 100 : 0,
    maxTireTempFL: Math.round(maxTFL), maxTireTempFR: Math.round(maxTFR),
    maxTireTempRL: Math.round(maxTRL), maxTireTempRR: Math.round(maxTRR),
    avgTireTempFL: Math.round(sumTFL / n), avgTireTempFR: Math.round(sumTFR / n),
    avgTireTempRL: Math.round(sumTRL / n), avgTireTempRR: Math.round(sumTRR / n),
    suspRangeFL: Math.round((maxSFL - minSFL) * 100) / 100,
    suspRangeFR: Math.round((maxSFR - minSFR) * 100) / 100,
    suspRangeRL: Math.round((maxSRL - minSRL) * 100) / 100,
    suspRangeRR: Math.round((maxSRR - minSRR) * 100) / 100,
    driftScore: Math.round(driftScore),
    bestSustainedDriftSec: Math.round(bestDrift * 10) / 10,
    topChains,
    gearUsageDrift: gearUsagePct,
  }
}
