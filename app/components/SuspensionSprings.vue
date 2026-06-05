<script setup lang="ts">
const props = defineProps<{
  suspNorm: { fl: number; fr: number; rl: number; rr: number }
  suspMeters: { fl: number; fr: number; rl: number; rr: number }
}>()

type Corner = 'fl' | 'fr' | 'rl' | 'rr'
const CORNERS: { id: Corner; label: string }[] = [
  { id: 'fl', label: 'FL' }, { id: 'fr', label: 'FR' },
  { id: 'rl', label: 'RL' }, { id: 'rr', label: 'RR' },
]

// Per-corner state
const damperVel  = ref<Record<Corner, number>>({ fl: 0, fr: 0, rl: 0, rr: 0 })
const peakComp   = ref<Record<Corner, number>>({ fl: 0, fr: 0, rl: 0, rr: 0 })  // peak bump (mm/s)
const peakReb    = ref<Record<Corner, number>>({ fl: 0, fr: 0, rl: 0, rr: 0 })  // peak rebound (mm/s)
const prevMeters = ref<Record<Corner, number> | null>(null)

// Peak decay: 1.2 mm/s per frame → a 60 mm/s spike lingers ~1.7s at 30fps
const PEAK_DECAY = 1.2
const DT = 1 / 30

watch(
  () => ({ ...props.suspMeters }),
  (curr) => {
    for (const c of ['fl', 'fr', 'rl', 'rr'] as Corner[]) {
      const vel = prevMeters.value
        ? ((curr[c] - prevMeters.value[c]) / DT) * 1000
        : 0
      damperVel.value[c] = vel

      // Compression: positive velocity (spring shortening)
      peakComp.value[c] = Math.max(
        vel > 0 ? vel : 0,
        Math.max(0, peakComp.value[c] - PEAK_DECAY)
      )
      // Rebound: negative velocity (spring extending)
      peakReb.value[c] = Math.max(
        vel < 0 ? Math.abs(vel) : 0,
        Math.max(0, peakReb.value[c] - PEAK_DECAY)
      )
    }
    prevMeters.value = curr
  }
)

// ── Spring SVG geometry ────────────────────────────────────────
const CX = 20, AMP = 12, COILS = 6, SAMPLES = 12
const CAP_TOP = 8, CAP_BOT = 92
const MIN_SPAN = 34, MAX_SPAN = CAP_BOT - CAP_TOP

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }

function springYTop(comp: number): number {
  return CAP_BOT - (MAX_SPAN - clamp01(comp) * (MAX_SPAN - MIN_SPAN))
}

function coilPath(comp: number): string {
  const top = springYTop(comp)
  const n = COILS * SAMPLES
  let d = ''
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const y = top + t * (CAP_BOT - top)
    const x = CX + AMP * Math.sin(t * COILS * 2 * Math.PI)
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' '
  }
  return d.trim()
}

function springColor(comp: number): string {
  if (comp > 0.88) return 'var(--c-red)'
  if (comp > 0.70) return 'var(--c-amber)'
  if (comp < 0.20) return 'var(--c-data)'
  return 'var(--c-green)'
}

function isBottoming(comp: number): boolean { return comp > 0.88 }

// ── Position bar (shows suspension travel 0–100%) ──────────────
// Viewbox 0 0 10 100. Fill from CAP_BOT upward by comp fraction.
function posFillY(comp: number): number {
  return CAP_BOT - clamp01(comp) * MAX_SPAN
}
function posFillH(comp: number): number {
  return clamp01(comp) * MAX_SPAN
}

// ── Damper velocity bar (zero at center, REB up, BMP down) ─────
// Viewbox 0 0 14 100. Zero line at y=50.
const VEL_MID = 50
const VEL_MAX = 80   // mm/s at full scale
const VEL_PAD = 4    // end margin
const VEL_HALF = VEL_MID - VEL_PAD  // 46px available each side

function velFill(mmS: number): { y: number; h: number; isComp: boolean } {
  const isComp = mmS >= 0
  const frac = clamp01(Math.abs(mmS) / VEL_MAX)
  const h = frac * VEL_HALF
  return { y: isComp ? VEL_MID : VEL_MID - h, h, isComp }
}

function peakY(mmS: number, isComp: boolean): number {
  const frac = clamp01(mmS / VEL_MAX)
  const offset = frac * VEL_HALF
  return isComp ? VEL_MID + offset : VEL_MID - offset
}

// Zone ticks at ±25 and ±50 mm/s
const tick25 = (25 / VEL_MAX) * VEL_HALF
const tick50 = (50 / VEL_MAX) * VEL_HALF

// ── Readouts ───────────────────────────────────────────────────
function travelIn(m: number): string { return (m * 39.3701).toFixed(2) }

function velDisplay(vel: number): string {
  const v = Math.round(vel)
  return (v > 0 ? '+' : '') + v
}
</script>

<template>
  <div class="susp-grid">
    <div v-for="c in CORNERS" :key="c.id" class="susp-cell">

      <!-- Corner label -->
      <div class="susp-lbl" :class="`susp-lbl--${c.id}`">{{ c.label }}</div>

      <!-- Spring + position bar + velocity bar (centered widget unit) -->
      <div class="susp-widget">

        <!-- Coil spring SVG -->
        <svg
          viewBox="0 0 40 100"
          preserveAspectRatio="xMidYMid meet"
          class="susp-spring"
          :class="isBottoming(suspNorm[c.id]) ? 'bottoming-pulse' : ''"
        >
          <line :x1="CX-AMP-3" :y1="CAP_TOP" :x2="CX+AMP+3" :y2="CAP_TOP"
            stroke="rgba(255,255,255,0.06)" stroke-width="0.6" stroke-dasharray="2,2" />
          <rect x="2" :y="CAP_BOT-1" width="36" height="3" rx="1"
            fill="var(--c-red)" :opacity="isBottoming(suspNorm[c.id]) ? 0.9 : 0.18" />
          <line :x1="CX-AMP-3" :y1="springYTop(suspNorm[c.id])"
                :x2="CX+AMP+3" :y2="springYTop(suspNorm[c.id])"
                :stroke="springColor(suspNorm[c.id])" stroke-width="2.2" stroke-linecap="round" />
          <line :x1="CX-AMP-3" :y1="CAP_BOT" :x2="CX+AMP+3" :y2="CAP_BOT"
                :stroke="springColor(suspNorm[c.id])" stroke-width="2.2" stroke-linecap="round" />
          <path :d="coilPath(suspNorm[c.id])" fill="none"
                :stroke="springColor(suspNorm[c.id])"
                stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>

        <!-- Position / compression range bar -->
        <svg viewBox="0 0 10 100" preserveAspectRatio="none" class="susp-pos">
          <rect x="1" y="4" width="8" height="92" rx="2" fill="rgba(255,255,255,0.04)" />
          <rect
            x="2" :y="posFillY(suspNorm[c.id])" width="6" :height="posFillH(suspNorm[c.id])"
            rx="1.5" :fill="springColor(suspNorm[c.id])" opacity="0.7"
            style="transition: height 0.18s ease-out, y 0.18s ease-out;"
          />
          <line x1="0" y1="50" x2="10" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="0.6" stroke-dasharray="1.5,1.5" />
        </svg>

        <!-- Damper velocity bar — REB up (cyan), BMP/compression down (orange) -->
        <svg viewBox="0 0 22 100" preserveAspectRatio="none" class="susp-vel"
             :class="{ 'susp-vel--reb-active': damperVel[c.id] < -8, 'susp-vel--bmp-active': damperVel[c.id] > 8 }">
          <rect x="0" y="0" width="22" height="100" rx="3" fill="rgba(255,255,255,0.04)" />
          <!-- zone ticks ±25 and ±50 mm/s -->
          <line v-for="off in [tick25, tick50]" :key="'u'+off"
            x1="0" :y1="VEL_MID - off" x2="22" :y2="VEL_MID - off"
            stroke="rgba(255,255,255,0.07)" stroke-width="0.5" />
          <line v-for="off in [tick25, tick50]" :key="'d'+off"
            x1="0" :y1="VEL_MID + off" x2="22" :y2="VEL_MID + off"
            stroke="rgba(255,255,255,0.07)" stroke-width="0.5" />

          <!-- Rebound fill (cyan, upward from center) -->
          <template v-if="damperVel[c.id] < 0">
            <rect
              x="2.5" :y="velFill(damperVel[c.id]).y"
              width="17" :height="velFill(damperVel[c.id]).h"
              rx="1.5" fill="var(--c-data)" opacity="0.92"
            />
          </template>
          <!-- Bump/compression fill (orange, downward from center) -->
          <template v-else>
            <rect
              x="2.5" :y="velFill(damperVel[c.id]).y"
              width="17" :height="velFill(damperVel[c.id]).h"
              rx="1.5" fill="var(--c-drift)" opacity="0.92"
            />
          </template>

          <!-- Peak rebound marker (cyan tick, decays slowly) -->
          <line v-if="peakReb[c.id] > 3"
            x1="0" :y1="peakY(peakReb[c.id], false)"
            x2="22" :y2="peakY(peakReb[c.id], false)"
            stroke="var(--c-data)" stroke-width="1.6" stroke-linecap="round"
            :opacity="0.5 + 0.5 * (peakReb[c.id] / VEL_MAX)"
          />
          <!-- Peak bump marker (orange tick, decays slowly) -->
          <line v-if="peakComp[c.id] > 3"
            x1="0" :y1="peakY(peakComp[c.id], true)"
            x2="22" :y2="peakY(peakComp[c.id], true)"
            stroke="var(--c-drift)" stroke-width="1.6" stroke-linecap="round"
            :opacity="0.5 + 0.5 * (peakComp[c.id] / VEL_MAX)"
          />

          <!-- Zero center line -->
          <line x1="0" :y1="VEL_MID" x2="22" :y2="VEL_MID"
            stroke="rgba(255,255,255,0.35)" stroke-width="0.9" />

          <!-- REB / BMP axis labels -->
          <text x="11" y="9" text-anchor="middle" font-size="6.5"
            :fill="damperVel[c.id] < -8 ? 'var(--c-data)' : 'rgba(0,204,255,0.45)'"
            font-family="var(--font-display)" font-weight="700">REB</text>
          <text x="11" y="97" text-anchor="middle" font-size="6.5"
            :fill="damperVel[c.id] > 8 ? 'var(--c-drift)' : 'rgba(255,85,0,0.45)'"
            font-family="var(--font-display)" font-weight="700">BMP</text>
        </svg>

      </div>

      <!-- Readout row sits directly under the widget at matching width -->
      <div class="susp-readout">
        <span class="susp-travel" :style="{ color: springColor(suspNorm[c.id]) }">
          {{ travelIn(suspMeters[c.id]) }}<span class="susp-unit">in</span>
        </span>
        <span
          class="susp-vel-num"
          :style="{ color: damperVel[c.id] < -5 ? 'var(--c-data)' : damperVel[c.id] > 5 ? 'var(--c-drift)' : 'var(--c-text-mid)' }"
        >
          {{ velDisplay(damperVel[c.id]) }}<span class="susp-unit">mm/s</span>
        </span>
      </div>

    </div>
  </div>
</template>

<style scoped>
.susp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.4rem;
}

/* Each corner widget is centered in its cell — no more stretched apart values */
.susp-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.susp-lbl {
  font-family: var(--font-display);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-text-mid);
  align-self: stretch;       /* full-width header above the widget */
  text-align: left;
  padding: 0 0.1rem;
}

/* The spring + position + velocity bars sit as one tight unit */
.susp-widget {
  display: flex;
  gap: 4px;
  align-items: stretch;
  height: 92px;
}
.susp-spring { width: 30px; flex-shrink: 0; height: 100%; }
.susp-pos    { width: 8px;  flex-shrink: 0; height: 100%; }
.susp-vel    {
  width: 22px;
  flex-shrink: 0;
  height: 100%;
  transition: filter 0.15s, box-shadow 0.15s;
  border-radius: 3px;
}
/* Glow when damper is in active rebound or bump */
.susp-vel--reb-active {
  filter: drop-shadow(0 0 4px var(--c-data));
}
.susp-vel--bmp-active {
  filter: drop-shadow(0 0 4px var(--c-drift));
}

/* Readout row matches the widget width so numbers don't drift apart */
.susp-readout {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
  max-width: 88px;       /* matches widget width: 30+8+22+4+4 = 68 + padding */
  gap: 4px;
}
.susp-travel {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 600;
}
.susp-vel-num {
  font-family: var(--font-mono);
  font-size: 0.6rem;
}
.susp-unit {
  font-size: 0.46rem;
  opacity: 0.55;
  margin-left: 1px;
}

@keyframes bottoming-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.bottoming-pulse { animation: bottoming-pulse 0.35s ease-in-out infinite; }
</style>
