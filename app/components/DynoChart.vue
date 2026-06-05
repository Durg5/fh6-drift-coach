<script setup lang="ts">
import type { DynoBin } from '../composables/useDyno'

const props = defineProps<{
  bins: DynoBin[]
  peakPower: DynoBin | null
  peakTorque: DynoBin | null
  powerBand: { low: number; high: number } | null
  /** Optional live RPM marker (current engine RPM) */
  liveRpm?: number
  /** Optional engine min/max RPM for X-axis scaling. Defaults computed from bins. */
  rpmMin?: number
  rpmMax?: number
}>()

const VIEW_W = 400
const VIEW_H = 160
const PAD_L = 30
const PAD_R = 8
const PAD_T = 8
const PAD_B = 22

const xMin = computed(() => {
  if (props.rpmMin) return props.rpmMin
  return props.bins.length ? Math.floor(props.bins[0]!.rpm / 1000) * 1000 : 1000
})
const xMax = computed(() => {
  if (props.rpmMax) return props.rpmMax
  return props.bins.length ? Math.ceil(props.bins[props.bins.length - 1]!.rpm / 1000) * 1000 : 8000
})
const yMaxHp = computed(() => {
  const peak = props.peakPower?.powerHpMax ?? 100
  return Math.ceil((peak * 1.1) / 50) * 50
})
const yMaxTq = computed(() => {
  const peak = props.peakTorque?.torqueLbFtMax ?? 100
  return Math.ceil((peak * 1.1) / 50) * 50
})

function xFor(rpm: number) {
  return PAD_L + ((rpm - xMin.value) / Math.max(1, xMax.value - xMin.value)) * (VIEW_W - PAD_L - PAD_R)
}
function yHp(hp: number) {
  return VIEW_H - PAD_B - (hp / yMaxHp.value) * (VIEW_H - PAD_T - PAD_B)
}
function yTq(tq: number) {
  return VIEW_H - PAD_B - (tq / yMaxTq.value) * (VIEW_H - PAD_T - PAD_B)
}

// Smoothed-line path. We use Catmull-Rom→Bezier for a natural-looking curve.
function pathFor(getY: (b: DynoBin) => number): string {
  const pts = props.bins.map(b => ({ x: xFor(b.rpm), y: getY(b) }))
  if (!pts.length) return ''
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`
  let d = `M${pts[0]!.x},${pts[0]!.y}`
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!
    const cx = (p0.x + p1.x) / 2
    d += ` Q ${cx},${p0.y} ${cx},${(p0.y + p1.y) / 2}`
    d += ` Q ${cx},${p1.y} ${p1.x},${p1.y}`
  }
  return d
}
const powerPath  = computed(() => pathFor(b => yHp(b.powerHpMax)))
const torquePath = computed(() => pathFor(b => yTq(b.torqueLbFtMax)))

// X-axis ticks every 1000 RPM
const xTicks = computed<number[]>(() => {
  const ticks: number[] = []
  for (let v = Math.ceil(xMin.value / 1000) * 1000; v <= xMax.value; v += 1000) ticks.push(v)
  return ticks
})
</script>

<template>
  <div class="dyno-wrap">
    <svg :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`" class="dyno-svg" preserveAspectRatio="xMidYMid meet">
      <!-- Power-band shading -->
      <rect
        v-if="powerBand"
        :x="xFor(powerBand.low)"
        :y="PAD_T"
        :width="xFor(powerBand.high) - xFor(powerBand.low)"
        :height="VIEW_H - PAD_T - PAD_B"
        fill="rgba(255, 85, 0, 0.08)"
        stroke="rgba(255, 85, 0, 0.18)"
        stroke-dasharray="3,2"
        stroke-width="0.5"
      />

      <!-- X-axis grid + labels -->
      <g class="dyno-axis">
        <line v-for="r in xTicks" :key="`x-${r}`"
          :x1="xFor(r)" :y1="PAD_T" :x2="xFor(r)" :y2="VIEW_H - PAD_B"
          stroke="rgba(255,255,255,0.05)" stroke-width="0.4" />
        <text v-for="r in xTicks" :key="`xl-${r}`"
          :x="xFor(r)" :y="VIEW_H - PAD_B + 9"
          text-anchor="middle" class="dyno-tick">{{ r / 1000 }}k</text>
      </g>

      <!-- Y-axis grid + labels (HP on left, TQ on right) -->
      <line :x1="PAD_L" :y1="PAD_T" :x2="PAD_L" :y2="VIEW_H - PAD_B"
        stroke="rgba(255,255,255,0.18)" stroke-width="0.5" />
      <text :x="PAD_L - 4" :y="yHp(yMaxHp)" text-anchor="end" class="dyno-tick" dominant-baseline="middle">{{ yMaxHp }}</text>
      <text :x="PAD_L - 4" :y="yHp(yMaxHp / 2)" text-anchor="end" class="dyno-tick" dominant-baseline="middle">{{ yMaxHp / 2 }}</text>
      <text :x="PAD_L - 4" :y="VIEW_H - PAD_B" text-anchor="end" class="dyno-tick" dominant-baseline="middle">0</text>

      <!-- Curves -->
      <path :d="torquePath" stroke="var(--c-data)" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path :d="powerPath"  stroke="var(--c-drift)" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />

      <!-- Peak markers -->
      <g v-if="peakPower">
        <circle :cx="xFor(peakPower.rpm)" :cy="yHp(peakPower.powerHpMax)" r="2.2" fill="var(--c-drift)" />
        <text :x="xFor(peakPower.rpm) + 4" :y="yHp(peakPower.powerHpMax) - 3" class="dyno-peak-lbl" fill="var(--c-drift)">
          {{ Math.round(peakPower.powerHpMax) }}hp @{{ Math.round(peakPower.rpm) }}
        </text>
      </g>
      <g v-if="peakTorque">
        <circle :cx="xFor(peakTorque.rpm)" :cy="yTq(peakTorque.torqueLbFtMax)" r="2.2" fill="var(--c-data)" />
        <text :x="xFor(peakTorque.rpm) + 4" :y="yTq(peakTorque.torqueLbFtMax) + 8" class="dyno-peak-lbl" fill="var(--c-data)">
          {{ Math.round(peakTorque.torqueLbFtMax) }}lb·ft @{{ Math.round(peakTorque.rpm) }}
        </text>
      </g>

      <!-- Live RPM needle -->
      <line v-if="liveRpm && liveRpm > xMin && liveRpm < xMax"
        :x1="xFor(liveRpm)" :y1="PAD_T"
        :x2="xFor(liveRpm)" :y2="VIEW_H - PAD_B"
        stroke="var(--c-amber)" stroke-width="0.8" stroke-dasharray="2,2"
      />

      <!-- Legend -->
      <g class="dyno-legend" transform="translate(38, 13)">
        <line x1="0" y1="0" x2="10" y2="0" stroke="var(--c-drift)" stroke-width="1.8" />
        <text x="13" y="1.5" dominant-baseline="middle">HP</text>
        <line x1="34" y1="0" x2="44" y2="0" stroke="var(--c-data)" stroke-width="1.6" />
        <text x="47" y="1.5" dominant-baseline="middle">LB·FT</text>
      </g>

      <!-- Empty state -->
      <text v-if="!bins.length"
        :x="VIEW_W / 2" :y="VIEW_H / 2"
        text-anchor="middle" class="dyno-empty"
      >
        Drive at full throttle through the RPM range to build the curve
      </text>
    </svg>
  </div>
</template>

<style scoped>
.dyno-wrap {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 85, 0, 0.12);
  border-radius: 5px;
  overflow: hidden;
}
.dyno-svg {
  width: 100%;
  aspect-ratio: 2.5;
  display: block;
}
.dyno-tick {
  font-family: var(--font-mono);
  font-size: 7px;
  fill: var(--c-text-mid);
}
.dyno-peak-lbl {
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 700;
}
.dyno-legend text {
  font-family: var(--font-mono);
  font-size: 7px;
  fill: var(--c-text-mid);
}
.dyno-empty {
  font-family: var(--font-mono);
  font-size: 7.5px;
  fill: var(--c-text-dim);
  font-style: italic;
}
</style>
