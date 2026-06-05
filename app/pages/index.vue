<script setup lang="ts">
useHead({ title: 'Drift Coach — Live' })

const { telemetry, wsStatus } = useTelemetry()
const { isRecording, isPaused, frameCount, elapsedFormatted, startRecording, stopRecording } = useSessionRecorder()

const t = computed(() => telemetry.value)

// Per-car observed dyno — accumulates as you drive at full throttle
const { sortedBins: dynoBins, peakPower, peakTorque, powerBand: dynoBand } = useDyno()

const speedKmh      = computed(() => t.value?.speedKmh ?? 0)
const speedMph      = computed(() => t.value?.speedMph ?? 0)
const gear          = computed(() => t.value?.gear ?? 0)
const rpm           = computed(() => t.value?.currentEngineRpm ?? 0)
const rpmMax        = computed(() => t.value?.engineMaxRpm ?? 8000)
const rpmIdle       = computed(() => t.value?.engineIdleRpm ?? 800)
const throttle      = computed(() => t.value?.throttle ?? 0)
const brake         = computed(() => t.value?.brake ?? 0)
const clutch        = computed(() => t.value?.clutch ?? 0)
const steer         = computed(() => t.value?.steer ?? 0)
const handbrake     = computed(() => t.value?.handbrake ?? false)

const driftAngle    = computed(() => t.value?.driftAngleDeg ?? 0)
const isDrifting    = computed(() => t.value?.isDrifting ?? false)
const driftDir      = computed(() => t.value?.driftDirection ?? 'none')
const rearSlip      = computed(() => t.value?.rearCombinedSlip ?? 0)
const yawRate       = computed(() => t.value?.yawRateDegS ?? 0)
const counterSteer  = computed(() => t.value?.counterSteer ?? false)

const tireTemps     = computed(() => t.value?.tireTempF ?? { fl: 32, fr: 32, rl: 32, rr: 32 })
const tireCombSlip  = computed(() => t.value?.combinedSlip ?? { fl: 0, fr: 0, rl: 0, rr: 0 })
const rawSusp       = computed(() => t.value?.suspNorm ?? { fl: 0.5, fr: 0.5, rl: 0.5, rr: 0.5 })
const rawSuspMeters = computed(() => t.value?.suspMeters ?? { fl: 0, fr: 0, rl: 0, rr: 0 })

// ── Low-pass smoothing for visualisations (suspension / slip were "spazzy" at 30Hz raw) ──
// alpha closer to 0 = smoother + laggier; closer to 1 = snappier + jumpier.
type Corners = { fl: number; fr: number; rl: number; rr: number }
const smoothedSusp        = ref<Corners>({ fl: 0.5, fr: 0.5, rl: 0.5, rr: 0.5 })
const smoothedSuspMeters  = ref<Corners>({ fl: 0, fr: 0, rl: 0, rr: 0 })
const smoothedSlip        = ref<Corners>({ fl: 0, fr: 0, rl: 0, rr: 0 })
function ema(prev: Corners, next: Corners, alpha: number): Corners {
  return {
    fl: prev.fl + alpha * (next.fl - prev.fl),
    fr: prev.fr + alpha * (next.fr - prev.fr),
    rl: prev.rl + alpha * (next.rl - prev.rl),
    rr: prev.rr + alpha * (next.rr - prev.rr),
  }
}
watch(rawSusp,        v => { smoothedSusp.value        = ema(smoothedSusp.value,        v, 0.18) })
watch(rawSuspMeters,  v => { smoothedSuspMeters.value  = ema(smoothedSuspMeters.value,  v, 0.18) })
watch(tireCombSlip,   v => { smoothedSlip.value        = ema(smoothedSlip.value,        v, 0.25) })
const susp        = computed(() => smoothedSusp.value)
const suspMeters  = computed(() => smoothedSuspMeters.value)
const smoothSlip  = computed(() => smoothedSlip.value)

const power         = computed(() => t.value ? Math.round(t.value.power / 745.7) : 0)
const torque        = computed(() => t.value ? Math.round(t.value.torque * 0.7376) : 0)
const boost         = computed(() => t.value?.boost ?? 0)

const lap           = computed(() => t.value?.lapNumber ?? 0)
const currentLapMs  = computed(() => (t.value?.currentLap ?? 0) * 1000)
const bestLapMs     = computed(() => (t.value?.bestLap ?? 0) * 1000)

const wheelSpeed    = computed(() => t.value?.wheelSpeed ?? { fl: 0, fr: 0, rl: 0, rr: 0 })

// ── Live drift score ───────────────────────────────────────
// Accumulates while isDrifting is true; freezes briefly when the chain
// breaks so the driver can read the result, then resets on the next drift.
// score = angle° × (speed km/h / 100) × seconds — same formula as session calcStats
const liveDriftScore = ref(0)
const lastDriftScore = ref(0)
let lastTickMs = 0
let lastDrifting = false
let driftSettleTimer: ReturnType<typeof setTimeout> | null = null

watch(t, (frame) => {
  if (!frame) return
  const now = Date.now()
  const dt = lastTickMs ? Math.min(0.1, (now - lastTickMs) / 1000) : 0
  lastTickMs = now

  if (frame.isDrifting) {
    if (driftSettleTimer) { clearTimeout(driftSettleTimer); driftSettleTimer = null }
    if (!lastDrifting) liveDriftScore.value = 0  // fresh drift chain
    liveDriftScore.value += Math.abs(frame.driftAngleDeg) * (frame.speedKmh / 100) * dt
  } else if (lastDrifting) {
    // chain just broke — show final score for 2s, then start the reset countdown
    lastDriftScore.value = liveDriftScore.value
    driftSettleTimer = setTimeout(() => { liveDriftScore.value = 0 }, 2200)
  }
  lastDrifting = frame.isDrifting
})

// Front-vs-rear combined-slip balance (-1 = max understeer, +1 = max oversteer)
const slipBalance = computed<number>(() => {
  const f = (Math.abs(smoothedSlip.value.fl) + Math.abs(smoothedSlip.value.fr)) / 2
  const r = (Math.abs(smoothedSlip.value.rl) + Math.abs(smoothedSlip.value.rr)) / 2
  const total = f + r
  if (total < 0.05) return 0
  return Math.max(-1, Math.min(1, (r - f) / total))  // +ve = rear slipping more (OS)
})

// ── G-force compass — smoothed XY plot of lateral × longitudinal accel ────
// Forza accelX = lateral, accelZ = longitudinal (positive Z = forward accel)
const smoothLatG  = ref(0)
const smoothLongG = ref(0)
watch(t, (frame) => {
  if (!frame) return
  smoothLatG.value  += 0.2 * (frame.accelX - smoothLatG.value)
  smoothLongG.value += 0.2 * (frame.accelZ - smoothLongG.value)
})
// Peak G hold (decays over time)
const peakLatG  = ref(0)
const peakLongG = ref(0)
watch(t, (frame) => {
  if (!frame) return
  if (Math.abs(frame.accelX) > Math.abs(peakLatG.value))  peakLatG.value  = frame.accelX
  if (Math.abs(frame.accelZ) > Math.abs(peakLongG.value)) peakLongG.value = frame.accelZ
})
function gComboMag(lat: number, lon: number) {
  return Math.sqrt(lat * lat + lon * lon)
}

// ── Drift chain stats: best score this session + current chain duration ──
const bestDriftScore = ref(0)
const chainStartMs = ref(0)
const chainDurMs = ref(0)
watch(t, (frame) => {
  if (!frame) return
  if (frame.isDrifting) {
    if (chainStartMs.value === 0) chainStartMs.value = Date.now()
    chainDurMs.value = Date.now() - chainStartMs.value
    if (liveDriftScore.value > bestDriftScore.value) bestDriftScore.value = liveDriftScore.value
  } else {
    chainStartMs.value = 0
    chainDurMs.value = 0
  }
})

// ── Power-band status — uses OBSERVED dyno data when available, falls back
// to the static idle-to-redline heuristic on a fresh car. Real peak power
// is way more accurate than guessing 55-92% of the rev range.
const rpmPct = computed<number>(() => {
  const range = Math.max(rpmMax.value - rpmIdle.value, 1)
  return Math.max(0, Math.min(1, (rpm.value - rpmIdle.value) / range))
})
const inPowerBand = computed(() => {
  if (dynoBand.value) {
    return rpm.value >= dynoBand.value.low && rpm.value <= dynoBand.value.high
  }
  return rpmPct.value >= 0.55 && rpmPct.value <= 0.92
})
const nearRedline = computed(() => rpmPct.value >= 0.92)
const onPeakTorque = computed(() => {
  if (!peakTorque.value) return false
  return Math.abs(rpm.value - peakTorque.value.rpm) < 350  // ±350 rpm around peak torque
})

// ── Speed delta — tracks acceleration/deceleration trend ──
const speedHistory: number[] = []
const speedDeltaKmh = ref(0)  // last ~0.5s delta
watch(t, (frame) => {
  if (!frame) return
  speedHistory.push(frame.speedKmh)
  if (speedHistory.length > 15) speedHistory.shift()  // ~0.5s @ 30Hz
  if (speedHistory.length >= 2) {
    const first = speedHistory[0]!
    const last = speedHistory[speedHistory.length - 1]!
    speedDeltaKmh.value = last - first
  }
})

function formatMs(ms: number): string {
  if (!ms || ms < 0) return '--:--.---'
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = totalSec - m * 60
  return `${m}:${s.toFixed(3).padStart(6, '0')}`
}

const gearLabel = computed(() => {
  const g = gear.value
  if (g === 0) return 'N'
  if (g > 10) return '↑'
  return String(g)
})
</script>

<template>
  <div class="flex flex-col gap-2">

    <!-- ── Header ─────────────────────────────────── -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3">
        <h1 style="font-family:var(--font-display); font-size:1.2rem; font-weight:700; letter-spacing:0.06em; color:var(--c-text); line-height:1;">
          LIVE TELEMETRY
        </h1>
        <div class="drift-badge" :class="isDrifting ? 'drift-badge--active' : ''">
          <span style="width:6px; height:6px; border-radius:50%; display:inline-block;" :style="{ background: isDrifting ? 'var(--c-drift)' : 'var(--c-text-dim)' }" />
          {{ isDrifting ? 'DRIFTING' : 'GRIP' }}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="!isRecording">
          <button class="rec-btn" @click="startRecording">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--c-red);display:inline-block;" />
            REC
          </button>
        </template>
        <template v-else>
          <span
            class="live-dot"
            :style="{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: isPaused ? 'var(--c-amber)' : 'var(--c-red)' }"
            :title="isPaused ? 'Telemetry stalled — recording auto-paused. Will resume when frames return.' : ''"
          >
            ● {{ isPaused ? 'PAUSED' : '' }} {{ elapsedFormatted }} · {{ frameCount.toLocaleString() }}f
          </span>
          <button class="rec-btn rec-btn--stop" @click="stopRecording">■ STOP</button>
        </template>
      </div>
    </div>

    <!-- ── No-signal notice ──────────────────────── -->
    <div v-if="!t" class="dc-card dc-card--drift" style="padding:1.2rem; text-align:center;">
      <div class="dc-b dc-b--tl" />
      <div class="dc-b dc-b--br" />
      <div class="dc-topbar" />
      <div style="font-family:var(--font-display); font-size:0.85rem; letter-spacing:0.1em; color:var(--c-text-mid); margin-bottom:0.3rem;">AWAITING SIGNAL</div>
      <div style="font-size:0.72rem; color:var(--c-text-dim);">Set Forza Data Out → Car Dash · Out IP = this machine · Out Port = 5330</div>
    </div>

    <!-- ── Main 4-column grid: speed/inputs | drift gauge | advanced | dynamics/times ── -->
    <div class="live-grid">

      <!-- ═══ LEFT COLUMN ═══ -->
      <div class="flex flex-col gap-2">

        <!-- Speed + Gear + Engine (combined) -->
        <div class="dc-card dc-card--data">
          <div class="dc-topbar dc-topbar--data" />
          <div class="dc-b dc-b--tl dc-b--data" />
          <div class="dc-b dc-b--tr dc-b--data" />
          <div class="dc-b dc-b--bl dc-b--data" />
          <div class="dc-b dc-b--br dc-b--data" />
          <div class="dc-label">Speed / Engine</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.5rem;">
            <!-- Speed + Gear row -->
            <div class="flex items-center justify-between gap-2 mb-2">
              <div>
                <div style="font-family:var(--font-mono); font-size:1.9rem; font-weight:700; color:var(--c-data); line-height:1;">
                  {{ Math.round(speedMph) }}
                </div>
                <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-text-mid); line-height:1; margin-top:0.15rem;">
                  <span style="color:var(--c-text-mid);" class="dc-lbl">mph</span>
                  <span style="margin-left:0.4rem; opacity:0.55;">{{ Math.round(speedKmh) }}km/h</span>
                </div>
              </div>
              <div
                style="width:52px; height:52px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; border:2px solid; transition:all 0.1s;"
                :style="{
                  borderColor: isDrifting ? 'var(--c-drift)' : 'var(--c-data)',
                  background: isDrifting ? 'rgba(255,85,0,0.10)' : 'rgba(0,204,255,0.06)',
                  boxShadow: isDrifting ? '0 0 18px -4px var(--c-drift-glow)' : '0 0 18px -4px var(--c-data-glow)',
                }"
              >
                <span
                  style="font-family:var(--font-mono); font-size:2rem; font-weight:700; line-height:1;"
                  :style="{ color: isDrifting ? 'var(--c-drift)' : 'var(--c-data)' }"
                >{{ gearLabel }}</span>
              </div>
            </div>
            <!-- RPM strip -->
            <RpmStrip :rpm="rpm" :rpm-max="rpmMax" :rpm-idle="rpmIdle" />
            <!-- Engine stats 2×2 -->
            <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
              <div class="flex justify-between items-baseline">
                <span class="dc-lbl">PWR</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">{{ power }}<span class="dc-unit">hp</span></span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="dc-lbl">TRQ</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">{{ torque }}<span class="dc-unit">lb·ft</span></span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="dc-lbl">BOOST</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">{{ boost.toFixed(1) }}<span class="dc-unit">psi</span></span>
              </div>
              <div class="flex justify-between items-baseline">
                <span class="dc-lbl">LAP</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">{{ lap || '--' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Inputs -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Inputs</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.5rem;">
            <InputDisplay
              :throttle="throttle"
              :brake="brake"
              :clutch="clutch"
              :steer="steer"
              :handbrake="handbrake"
            />
          </div>
        </div>

      </div>

      <!-- ═══ CENTER COLUMN ═══ -->
      <div class="flex flex-col gap-2">

        <!-- Drift angle gauge -->
        <div class="dc-card dc-card--drift" :class="isDrifting ? 'dc-active' : ''">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--tr" />
          <div class="dc-b dc-b--bl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Drift Angle</div>
          <div class="dc-body" style="display:flex; flex-direction:column; align-items:center; gap:0.35rem; padding: 1.2rem 0.65rem 0.5rem;">
            <DriftAngleGauge :angle-deg="driftAngle" :is-drifting="isDrifting" :direction="driftDir" />

            <!-- Live drift score — accumulates while drifting -->
            <div class="live-score-card" :class="isDrifting ? 'live-score-card--live' : ''">
              <div class="live-score-lbl">
                {{ isDrifting ? 'LIVE DRIFT SCORE' : (liveDriftScore > 0 ? 'CHAIN END' : 'NO DRIFT') }}
              </div>
              <div class="live-score-val">{{ Math.round(liveDriftScore).toLocaleString() }}</div>
            </div>

            <!-- Slip balance bar: rear-bias (oversteer) right, front-bias (understeer) left -->
            <div class="slip-bal">
              <div class="slip-bal-lbl-row">
                <span class="slip-bal-side">UNDER ←</span>
                <span class="slip-bal-mid">SLIP BALANCE</span>
                <span class="slip-bal-side">→ OVER</span>
              </div>
              <div class="slip-bal-track">
                <div class="slip-bal-zero" />
                <div
                  class="slip-bal-fill"
                  :style="{
                    left: slipBalance >= 0 ? '50%' : `${50 + slipBalance * 50}%`,
                    width: `${Math.abs(slipBalance) * 50}%`,
                    background: slipBalance >= 0 ? 'var(--c-drift)' : 'var(--c-data)',
                  }"
                />
              </div>
            </div>

            <div class="w-full grid grid-cols-3 gap-2" style="margin-top:0.1rem;">
              <div class="text-center">
                <div class="dc-lbl" style="font-size:0.54rem;">YAW RATE</div>
                <div style="font-family:var(--font-mono); font-size:0.84rem; margin-top:0.1rem;" :style="{ color: Math.abs(yawRate) > 60 ? 'var(--c-drift)' : 'var(--c-data)' }">
                  {{ Math.round(Math.abs(yawRate)) }}<span class="dc-unit">°/s</span>
                </div>
              </div>
              <div class="text-center">
                <div class="dc-lbl" style="font-size:0.54rem;">REAR SLIP</div>
                <div style="font-family:var(--font-mono); font-size:0.84rem; margin-top:0.1rem;" :style="{ color: rearSlip > 1 ? 'var(--c-drift)' : 'var(--c-green)' }">
                  {{ rearSlip.toFixed(2) }}
                </div>
              </div>
              <div class="text-center">
                <div class="dc-lbl" style="font-size:0.54rem;">C-STEER</div>
                <div
                  style="font-family:var(--font-display); font-size:0.76rem; font-weight:700; letter-spacing:0.1em; margin-top:0.12rem;"
                  :style="{ color: counterSteer ? 'var(--c-green)' : 'var(--c-text-mid)' }"
                >
                  {{ counterSteer ? '✓ ON' : 'OFF' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tires (suspension moved to new advanced col) -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Tires</div>
          <div class="dc-body" style="padding: 1.2rem 0.5rem 0.4rem;">
            <TireGrid :temps="tireTemps" :slip="smoothSlip" />
            <div class="flex justify-between mt-1" style="font-family:var(--font-mono); font-size:0.55rem; color:var(--c-text-dim);">
              <span>°F</span>
              <span>slip →</span>
            </div>
          </div>
        </div>

        <!-- Dyno + Power Status (consolidated) — dyno chart drives the power-band status.
             Replaces the old separate Power-Band heuristic card and standalone Dyno card. -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Dyno + Power Band</div>
          <div class="dc-body" style="padding: 1.2rem 0.55rem 0.55rem;">
            <!-- Status row: live state + peaks -->
            <div class="dyno-status-row">
              <span class="dyno-status-pill">
                <span v-if="nearRedline" style="color:var(--c-red);">▲ REDLINE</span>
                <span v-else-if="inPowerBand" style="color:var(--c-drift);">● IN POWER</span>
                <span v-else-if="rpmPct < 0.3" style="color:var(--c-text-dim);">LOW RPM</span>
                <span v-else style="color:var(--c-text-mid);">PRE-PEAK</span>
              </span>
              <span v-if="onPeakTorque" class="dyno-tq-flag" title="At peak-torque RPM — maximum rotation force">
                ◆ ON TORQUE
              </span>
              <span class="dyno-rpm-num">{{ Math.round(rpm).toLocaleString() }}<span class="dc-unit">rpm</span></span>
            </div>

            <!-- The dyno chart (observed peaks built from your runs) -->
            <DynoChart
              :bins="dynoBins"
              :peak-power="peakPower"
              :peak-torque="peakTorque"
              :power-band="dynoBand"
              :live-rpm="rpm"
              :rpm-min="Math.round(rpmIdle / 1000) * 1000"
              :rpm-max="Math.round(rpmMax / 1000) * 1000"
            />

            <!-- Peak markers + speed Δ in compact 3-stat row -->
            <div class="dyno-foot">
              <div class="dyno-stat" v-if="peakPower">
                <span class="dyno-stat-lbl">PEAK HP</span>
                <span class="dyno-stat-val" style="color:var(--c-drift);">
                  {{ Math.round(peakPower.powerHpMax) }}@{{ Math.round(peakPower.rpm / 100) * 100 }}
                </span>
              </div>
              <div class="dyno-stat" v-if="peakTorque">
                <span class="dyno-stat-lbl">PEAK TQ</span>
                <span class="dyno-stat-val" style="color:var(--c-data);">
                  {{ Math.round(peakTorque.torqueLbFtMax) }}@{{ Math.round(peakTorque.rpm / 100) * 100 }}
                </span>
              </div>
              <div class="dyno-stat">
                <span class="dyno-stat-lbl">SPEED Δ</span>
                <span class="dyno-stat-val" :style="{ color: speedDeltaKmh > 1 ? 'var(--c-green)' : speedDeltaKmh < -1 ? 'var(--c-amber)' : 'var(--c-text-mid)' }">
                  {{ speedDeltaKmh >= 0 ? '+' : '' }}{{ speedDeltaKmh.toFixed(1) }}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ═══ ADVANCED COLUMN (new) ═══ -->
      <div class="flex flex-col gap-2">

        <!-- Suspension (top of advanced column) -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Suspension</div>
          <div class="dc-body" style="padding: 1.2rem 0.5rem 0.4rem;">
            <SuspensionSprings :susp-norm="susp" :susp-meters="suspMeters" />
          </div>
        </div>

        <!-- Drift Chain — current duration + session best -->
        <div class="dc-card" :class="isDrifting ? 'dc-card--drift dc-active' : ''">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Drift Chain</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.55rem;">
            <div class="chain-row">
              <div class="chain-label">CURRENT</div>
              <div class="chain-val" :style="{ color: isDrifting ? 'var(--c-drift)' : 'var(--c-text-dim)' }">
                {{ (chainDurMs / 1000).toFixed(1) }}<span class="dc-unit">s</span>
              </div>
            </div>
            <div class="chain-row">
              <div class="chain-label">SESSION BEST</div>
              <div class="chain-val" style="color:var(--c-green);">
                {{ Math.round(bestDriftScore).toLocaleString() }}
              </div>
            </div>
            <div class="chain-row">
              <div class="chain-label">PEAK LAT G</div>
              <div class="chain-val" style="color:var(--c-amber); font-size:0.95rem;">
                {{ Math.abs(peakLatG).toFixed(2) }}
              </div>
            </div>
          </div>
        </div>

        <!-- G-Force compass — XY plot of lateral × longitudinal accel -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">G-Force</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.5rem;">
            <div class="g-compass">
              <svg viewBox="-110 -110 220 220" preserveAspectRatio="xMidYMid meet" class="g-svg">
                <!-- Outer ring -->
                <circle cx="0" cy="0" r="100" fill="none" stroke="rgba(255,85,0,0.18)" stroke-width="1.5" />
                <!-- Inner rings -->
                <circle cx="0" cy="0" r="66" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="0.8" stroke-dasharray="2,2" />
                <circle cx="0" cy="0" r="33" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.6" stroke-dasharray="1.5,1.5" />
                <!-- Cross hairs -->
                <line x1="-100" y1="0" x2="100" y2="0" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
                <line x1="0" y1="-100" x2="0" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="0.5" />
                <!-- Labels -->
                <!-- G-G diagram convention: braking pushes you FORWARD into the belts (UP), accelerating pushes you BACK into the seat (DOWN) -->
                <text x="0" y="-104" text-anchor="middle" fill="var(--c-text-dim)" font-family="var(--font-mono)" font-size="7">BRAKE</text>
                <text x="0" y="112" text-anchor="middle" fill="var(--c-text-dim)" font-family="var(--font-mono)" font-size="7">ACCEL</text>
                <!-- Physical sensation: turn right → body shoves LEFT. So a right turn plots to the left side. -->
                <text x="-104" y="3" text-anchor="end" fill="var(--c-text-dim)" font-family="var(--font-mono)" font-size="7">RIGHT</text>
                <text x="104" y="3" text-anchor="start" fill="var(--c-text-dim)" font-family="var(--font-mono)" font-size="7">LEFT</text>
                <!-- Peak hold (faint cross) — both axes follow physical sensation:
                     X positive (turn right) = body to LEFT side of compass
                     Y positive (accel)      = DOWN (seat shove) -->
                <line
                  :x1="-Math.max(-95, Math.min(95, peakLatG * 6.5)) - 4"
                  :y1="Math.max(-95, Math.min(95, peakLongG * 6.5))"
                  :x2="-Math.max(-95, Math.min(95, peakLatG * 6.5)) + 4"
                  :y2="Math.max(-95, Math.min(95, peakLongG * 6.5))"
                  stroke="rgba(255,85,0,0.4)" stroke-width="1.2"
                />
                <line
                  :x1="-Math.max(-95, Math.min(95, peakLatG * 6.5))"
                  :y1="Math.max(-95, Math.min(95, peakLongG * 6.5)) - 4"
                  :x2="-Math.max(-95, Math.min(95, peakLatG * 6.5))"
                  :y2="Math.max(-95, Math.min(95, peakLongG * 6.5)) + 4"
                  stroke="rgba(255,85,0,0.4)" stroke-width="1.2"
                />
                <!-- Live dot — physical-sensation orientation -->
                <circle
                  :cx="-Math.max(-95, Math.min(95, smoothLatG * 6.5))"
                  :cy="Math.max(-95, Math.min(95, smoothLongG * 6.5))"
                  :r="gComboMag(smoothLatG, smoothLongG) > 6 ? 5.5 : 3.5"
                  :fill="gComboMag(smoothLatG, smoothLongG) > 8 ? 'var(--c-drift)' : 'var(--c-data)'"
                  :opacity="0.92"
                  style="transition: r 0.15s, fill 0.2s;"
                />
              </svg>
              <div class="g-readouts">
                <div class="g-readout">
                  <span class="g-lbl">LAT</span>
                  <span class="g-val" :style="{ color: Math.abs(smoothLatG) > 8 ? 'var(--c-drift)' : 'var(--c-data)' }">
                    {{ smoothLatG.toFixed(1) }}
                  </span>
                </div>
                <div class="g-readout">
                  <span class="g-lbl">LONG</span>
                  <span class="g-val" :style="{ color: smoothLongG < -6 ? 'var(--c-amber)' : 'var(--c-data)' }">
                    {{ smoothLongG.toFixed(1) }}
                  </span>
                </div>
                <div class="g-readout">
                  <span class="g-lbl">|G|</span>
                  <span class="g-val" style="color:var(--c-green);">
                    {{ gComboMag(smoothLatG, smoothLongG).toFixed(1) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ═══ RIGHT COLUMN ═══ -->
      <div class="flex flex-col gap-2">

        <!-- Dynamics + Wheel Speeds (combined) -->
        <div class="dc-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Dynamics</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.5rem;">
            <!-- G-forces and motion -->
            <div style="display:flex; flex-direction:column; gap:0.28rem;">
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">LAT G</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem;" :style="{ color: Math.abs(t?.accelX ?? 0) > 8 ? 'var(--c-drift)' : 'var(--c-data)' }">
                  {{ (t?.accelX ?? 0).toFixed(2) }}<span class="dc-unit">m/s²</span>
                </span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">LONG G</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem; color:var(--c-data);">
                  {{ (t?.accelZ ?? 0).toFixed(2) }}<span class="dc-unit">m/s²</span>
                </span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">BODY ROLL</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem; color:var(--c-amber);">
                  {{ ((t?.roll ?? 0) * 180 / Math.PI).toFixed(1) }}<span class="dc-unit">°</span>
                </span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">VEL X</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem;" :style="{ color: Math.abs(t?.velX ?? 0) > 3 ? 'var(--c-drift)' : 'var(--c-text-mid)' }">
                  {{ (t?.velX ?? 0).toFixed(2) }}<span class="dc-unit">m/s</span>
                </span>
              </div>
            </div>
            <!-- Wheel speeds inline grid -->
            <div style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid rgba(255,85,0,0.08);">
              <div class="dc-lbl" style="font-size:0.5rem; margin-bottom:0.25rem;">WHEEL SPEED rad/s</div>
              <div class="grid grid-cols-4 gap-1">
                <div
                  v-for="(ws, corner) in wheelSpeed" :key="corner"
                  style="text-align:center; padding:0.2rem 0.1rem; background:rgba(255,255,255,0.02); border-radius:4px; border:1px solid rgba(255,255,255,0.04);"
                >
                  <div class="dc-lbl" style="font-size:0.48rem;">{{ (corner as string).toUpperCase() }}</div>
                  <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-data); line-height:1.2;">{{ Math.round(ws) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Lap Times + Car Info (combined) -->
        <div class="dc-card dc-card--data">
          <div class="dc-topbar dc-topbar--data" />
          <div class="dc-b dc-b--tl dc-b--data" />
          <div class="dc-b dc-b--br dc-b--data" />
          <div class="dc-label">Times & Car</div>
          <div class="dc-body" style="padding: 1.2rem 0.65rem 0.5rem;">
            <!-- Lap times -->
            <div style="display:flex; flex-direction:column; gap:0.28rem;">
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">CURRENT</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">{{ formatMs(currentLapMs) }}</span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">BEST</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-amber);">{{ formatMs(bestLapMs) }}</span>
              </div>
              <div class="flex items-baseline justify-between">
                <span class="dc-lbl">DIST</span>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-text-mid);">
                  {{ t ? (t.distanceTraveled * 0.000621371).toFixed(2) : '--' }}<span class="dc-unit">mi</span>
                </span>
              </div>
            </div>
            <!-- Car info divider -->
            <div style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid rgba(0,204,255,0.08);">
              <div style="display:flex; flex-direction:column; gap:0.28rem;">
                <div class="flex items-baseline justify-between">
                  <span class="dc-lbl">PI / CLASS</span>
                  <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">
                    {{ t?.carPI ?? '--' }}
                    <span style="opacity:0.6; font-size:0.7em; margin-left:0.2em;">{{ ['D','C','B','A','S1','S2','X'][t?.carClass ?? -1] ?? '?' }}</span>
                  </span>
                </div>
                <div class="flex items-baseline justify-between">
                  <span class="dc-lbl">DRIVE</span>
                  <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--c-data);">
                    {{ ['FWD','RWD','AWD'][t?.drivetrain ?? -1] ?? '?' }}
                  </span>
                </div>
                <div class="flex items-baseline justify-between">
                  <span class="dc-lbl">PACKET</span>
                  <span style="font-family:var(--font-mono); font-size:0.8rem;" :style="{ color: t?.version === 'fh6' ? 'var(--c-green)' : 'var(--c-amber)' }">
                    {{ t?.version?.toUpperCase() ?? '--' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Four-column live grid: speed/inputs | drift gauge (narrower) | advanced | dynamics/times */
.live-grid {
  display: grid;
  grid-template-columns: 195px 420px 1fr 200px;
  gap: 0.5rem;
  align-items: start;
}
@media (max-width: 1400px) {
  .live-grid { grid-template-columns: 180px 380px 1fr 195px; }
}
@media (max-width: 1180px) {
  /* Collapse to 2 col on small viewports */
  .live-grid { grid-template-columns: 1fr 1fr; }
}

/* Dyno status row (above chart) */
.dyno-status-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.dyno-status-pill {
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.dyno-tq-flag {
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-data);
  background: rgba(0, 204, 255, 0.1);
  border: 1px solid rgba(0, 204, 255, 0.3);
  padding: 1px 5px;
  border-radius: 2px;
}
.dyno-rpm-num {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

/* Dyno footer 3-stat grid */
.dyno-foot {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.3rem;
  padding-top: 0.4rem;
  margin-top: 0.4rem;
  border-top: 1px solid rgba(255, 85, 0, 0.08);
}
.dyno-stat { display: flex; flex-direction: column; align-items: center; }
.dyno-stat-lbl {
  font-family: var(--font-display);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: var(--c-text-mid);
  text-transform: uppercase;
}
.dyno-stat-val {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 0.1rem;
}

/* G-Force compass */
.g-compass {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}
.g-svg {
  width: 100%;
  max-width: 170px;
  aspect-ratio: 1;
}
.g-readouts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
  width: 100%;
  padding-top: 0.3rem;
  border-top: 1px solid rgba(255,85,0,0.08);
}
.g-readout {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.g-lbl {
  font-family: var(--font-display);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: var(--c-text-mid);
  text-transform: uppercase;
}
.g-val {
  font-family: var(--font-mono);
  font-size: 0.84rem;
  font-weight: 700;
  margin-top: 0.1rem;
  font-variant-numeric: tabular-nums;
}

/* RPM power band */
/* Drift chain card */
.chain-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.2rem 0;
}
.chain-row + .chain-row {
  border-top: 1px dashed rgba(255,85,0,0.08);
}
.chain-label {
  font-family: var(--font-display);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  color: var(--c-text-mid);
  text-transform: uppercase;
}
.chain-val {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

/* Live drift score — fades in/out with drift state */
.live-score-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.4rem 0.5rem 0.45rem;
  background: rgba(255, 85, 0, 0.04);
  border: 1px solid rgba(255, 85, 0, 0.15);
  border-radius: 5px;
  transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
  margin-top: 0.2rem;
}
.live-score-card--live {
  background: rgba(255, 85, 0, 0.13);
  border-color: var(--c-drift);
  box-shadow: 0 0 22px -6px var(--c-drift-glow);
}
.live-score-lbl {
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--c-text-mid);
  text-transform: uppercase;
}
.live-score-card--live .live-score-lbl { color: var(--c-drift); }
.live-score-val {
  font-family: var(--font-mono);
  font-size: 1.55rem;
  font-weight: 700;
  color: var(--c-drift);
  line-height: 1.05;
  margin-top: 0.05rem;
  font-variant-numeric: tabular-nums;
}

/* Slip-balance bar */
.slip-bal { width: 100%; margin-top: 0.3rem; }
.slip-bal-lbl-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--c-text-dim);
  margin-bottom: 0.18rem;
  letter-spacing: 0.06em;
}
.slip-bal-mid {
  color: var(--c-text-mid);
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: 0.12em;
}
.slip-bal-side { font-size: 0.5rem; }
.slip-bal-track {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 2px;
  border: 1px solid rgba(255, 85, 0, 0.1);
  overflow: hidden;
}
.slip-bal-zero {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.16);
  transform: translateX(-50%);
}
.slip-bal-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  transition: left 0.18s ease-out, width 0.18s ease-out, background 0.2s;
}
</style>
