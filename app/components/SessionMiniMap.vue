<script setup lang="ts">
// Minimal SVG map of a saved session: bounds from posMinX/MaxX/MinZ/MaxZ,
// spins as red dots, top-chains as orange→cyan arrows (start → end).
// Aspect ratio is fixed; the map content is fit-scaled into a 0-100 box and
// flipped on Y so visually north is up.
interface Spin {
  posX: number; posZ: number
}
interface Chain {
  startPos: { x: number; y: number; z: number }
  endPos:   { x: number; y: number; z: number }
  durationSec: number
  score: number
}
interface Stats {
  posMinX: number; posMaxX: number
  posMinZ: number; posMaxZ: number
  spins?: Spin[]
  topChains?: Chain[]
}
const props = defineProps<{ stats: Stats }>()

// Compute world→view transform. Add 5% padding around the bounds so dots near
// the edge aren't clipped.
const VIEW = 100
const PAD = 5
const tx = computed(() => {
  const s = props.stats
  const spanX = Math.max(1, s.posMaxX - s.posMinX)
  const spanZ = Math.max(1, s.posMaxZ - s.posMinZ)
  // fit-to-square: scale uniformly so the wider axis fills the view
  const scale = (VIEW - 2 * PAD) / Math.max(spanX, spanZ)
  // center the smaller dimension
  const offX = PAD + (VIEW - 2 * PAD - spanX * scale) / 2
  const offY = PAD + (VIEW - 2 * PAD - spanZ * scale) / 2
  return { scale, offX, offY, sMinX: s.posMinX, sMinZ: s.posMinZ }
})
function toX(worldX: number) {
  const { scale, offX, sMinX } = tx.value
  return offX + (worldX - sMinX) * scale
}
function toY(worldZ: number) {
  const { scale, offY, sMinZ } = tx.value
  // Flip Z so North faces up
  return VIEW - (offY + (worldZ - sMinZ) * scale)
}
</script>

<template>
  <svg viewBox="0 0 100 100" class="mini-map">
    <!-- Outer frame -->
    <rect x="1" y="1" width="98" height="98" rx="2"
      fill="rgba(0,0,0,0.4)" stroke="rgba(255,85,0,0.18)" stroke-width="0.4" />

    <!-- Grid -->
    <line v-for="g in [25, 50, 75]" :key="`gx-${g}`"
      :x1="g" y1="2" :x2="g" y2="98" stroke="rgba(255,255,255,0.04)" stroke-width="0.3" />
    <line v-for="g in [25, 50, 75]" :key="`gy-${g}`"
      x1="2" :y1="g" x2="98" :y2="g" stroke="rgba(255,255,255,0.04)" stroke-width="0.3" />

    <!-- Top drift chains: arrow start (cyan dot) → end (orange dot) -->
    <template v-for="(c, i) in stats.topChains || []" :key="`chain-${i}`">
      <line
        :x1="toX(c.startPos.x)" :y1="toY(c.startPos.z)"
        :x2="toX(c.endPos.x)"   :y2="toY(c.endPos.z)"
        :stroke="i === 0 ? 'var(--c-drift)' : 'rgba(255,85,0,0.6)'"
        :stroke-width="i === 0 ? 1.2 : 0.8"
        stroke-linecap="round"
        :opacity="0.95 - i * 0.15"
      />
      <circle :cx="toX(c.startPos.x)" :cy="toY(c.startPos.z)" r="1.3"
        fill="var(--c-data)" :opacity="0.9 - i * 0.15" />
      <circle :cx="toX(c.endPos.x)"   :cy="toY(c.endPos.z)"   r="1.3"
        fill="var(--c-drift)" :opacity="0.9 - i * 0.15" />
      <!-- Rank label near start -->
      <text
        :x="toX(c.startPos.x) + 2" :y="toY(c.startPos.z) - 1.5"
        fill="var(--c-text-mid)" font-family="var(--font-mono)" font-size="3"
      >#{{ i + 1 }}</text>
    </template>

    <!-- Spin events: red dots -->
    <circle
      v-for="(sp, i) in stats.spins || []" :key="`spin-${i}`"
      :cx="toX(sp.posX)" :cy="toY(sp.posZ)" r="1"
      fill="var(--c-red)" opacity="0.7"
    />

    <!-- Bounds label -->
    <text x="3" y="6" fill="var(--c-text-dim)" font-family="var(--font-mono)" font-size="3">
      {{ Math.round(stats.posMaxX - stats.posMinX) }}×{{ Math.round(stats.posMaxZ - stats.posMinZ) }}m
    </text>

    <!-- Legend (bottom) -->
    <g transform="translate(2, 94)">
      <circle cx="1" cy="0" r="0.9" fill="var(--c-data)" />
      <text x="3" y="1" font-size="2.6" fill="var(--c-text-mid)" font-family="var(--font-mono)">START</text>
      <circle cx="14" cy="0" r="0.9" fill="var(--c-drift)" />
      <text x="16" y="1" font-size="2.6" fill="var(--c-text-mid)" font-family="var(--font-mono)">END</text>
      <circle cx="25" cy="0" r="0.9" fill="var(--c-red)" />
      <text x="27" y="1" font-size="2.6" fill="var(--c-text-mid)" font-family="var(--font-mono)">SPIN</text>
    </g>
  </svg>
</template>

<style scoped>
.mini-map {
  width: 100%;
  aspect-ratio: 1;
  display: block;
}
</style>
