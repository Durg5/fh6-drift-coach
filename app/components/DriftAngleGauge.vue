<script setup lang="ts">
const props = defineProps<{
  angleDeg: number
  isDrifting: boolean
  direction: 'left' | 'right' | 'none'
}>()

const MAX_ANGLE = 90
const cx = 100, cy = 110, r = 85

// Start at bottom-left (225°), sweep 270° to bottom-right (−45°)
const START = (225 * Math.PI) / 180
const SWEEP = (270 * Math.PI) / 180

const abs = computed(() => Math.min(Math.abs(props.angleDeg), MAX_ANGLE))
const fill = computed(() => abs.value / MAX_ANGLE)

// Color: 0-15° cyan, 15-40° amber, 40°+ drift orange/red
const arcColor = computed(() => {
  if (abs.value >= 40) return '#FF5500'
  if (abs.value >= 15) return '#FFB300'
  return '#00CCFF'
})

function arcPath(startA: number, sweepA: number): string {
  if (sweepA <= 0) return ''
  const endA = startA + sweepA
  const x1 = cx + r * Math.cos(startA)
  const y1 = cy + r * Math.sin(startA)
  const x2 = cx + r * Math.cos(endA)
  const y2 = cy + r * Math.sin(endA)
  const la = sweepA > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${la} 1 ${x2} ${y2}`
}

const trackPath = computed(() => arcPath(START, SWEEP))
const fillPath  = computed(() => arcPath(START, SWEEP * fill.value))

// Label display
const displayAngle = computed(() => Math.round(abs.value))
const dirLabel = computed(() =>
  props.direction === 'left' ? '◀' : props.direction === 'right' ? '▶' : ''
)
</script>

<template>
  <div class="relative" style="width:100%; aspect-ratio:1; max-width:160px; margin:0 auto;">
    <svg viewBox="0 0 200 200" class="w-full h-full">
      <defs>
        <filter id="dc-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <!-- Track -->
      <path :d="trackPath" fill="none" stroke="#1a0f2a" stroke-width="14" stroke-linecap="round" />

      <!-- Fill -->
      <path
        :d="fillPath"
        fill="none"
        :stroke="arcColor"
        stroke-width="14"
        stroke-linecap="round"
        :filter="isDrifting ? 'url(#dc-glow)' : undefined"
        style="transition: stroke 0.15s ease;"
      />

      <!-- Tick marks every 15° -->
      <g v-for="i in 7" :key="i">
        <line
          :x1="cx + 78 * Math.cos(START + SWEEP * ((i - 1) / 6))"
          :y1="cy + 78 * Math.sin(START + SWEEP * ((i - 1) / 6))"
          :x2="cx + 72 * Math.cos(START + SWEEP * ((i - 1) / 6))"
          :y2="cy + 72 * Math.sin(START + SWEEP * ((i - 1) / 6))"
          :stroke="i === 4 ? '#FFB300' : '#2a1a3a'"
          stroke-width="2"
          stroke-linecap="round"
        />
      </g>

      <!-- Big angle number -->
      <text
        x="100" y="108"
        text-anchor="middle"
        :font-family="'Share Tech Mono, monospace'"
        font-size="46"
        font-weight="700"
        :fill="isDrifting ? arcColor : '#4a3a5a'"
        style="transition: fill 0.15s ease;"
      >
        {{ displayAngle }}
      </text>

      <!-- Degree symbol -->
      <text x="100" y="128" text-anchor="middle" font-family="'Exo 2', sans-serif" font-size="10" fill="#5a4a6a" letter-spacing="1">
        DEGREES
      </text>

      <!-- Direction -->
      <text
        x="100" y="148"
        text-anchor="middle"
        :font-family="'Share Tech Mono, monospace'"
        font-size="14"
        :fill="isDrifting ? arcColor : '#3a2a4a'"
        style="transition: fill 0.15s ease;"
      >
        {{ dirLabel }}
      </text>
    </svg>
  </div>
</template>
