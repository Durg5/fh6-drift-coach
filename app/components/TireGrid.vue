<script setup lang="ts">
const props = defineProps<{
  temps: { fl: number; fr: number; rl: number; rr: number }
  slip?: { fl: number; fr: number; rl: number; rr: number }
  label?: string
}>()

function tempColor(f: number): string {
  if (f < 104) return '#334466'
  if (f < 149) return '#226688'
  if (f < 185) return '#00CC88'
  if (f < 212) return '#FFB300'
  return '#FF5500'
}

function slipColor(s: number): string {
  const a = Math.abs(s)
  if (a < 0.5)  return 'var(--c-green)'
  if (a < 1.0)  return 'var(--c-amber)'
  if (a < 2.0)  return 'var(--c-drift)'
  return 'var(--c-red)'
}

const corners = computed(() => [
  { id: 'fl', label: 'FL', temp: props.temps.fl, slip: props.slip?.fl },
  { id: 'fr', label: 'FR', temp: props.temps.fr, slip: props.slip?.fr },
  { id: 'rl', label: 'RL', temp: props.temps.rl, slip: props.slip?.rl },
  { id: 'rr', label: 'RR', temp: props.temps.rr, slip: props.slip?.rr },
])
</script>

<template>
  <div class="grid grid-cols-2 gap-1.5">
    <div
      v-for="c in corners"
      :key="c.id"
      style="border-radius:6px; padding:0.4rem 0.5rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04);"
      :style="{ borderColor: `${tempColor(c.temp)}33` }"
    >
      <div class="dc-lbl" style="font-size:0.55rem;">{{ c.label }}</div>
      <div style="display:flex; align-items:baseline; justify-content:space-between; margin-top:0.2rem;">
        <span style="font-family:var(--font-mono); font-size:0.85rem;" :style="{ color: tempColor(c.temp) }">
          {{ Math.round(c.temp) }}°F
        </span>
        <span
          v-if="c.slip !== undefined"
          style="font-family:var(--font-mono); font-size:0.68rem;"
          :style="{ color: slipColor(c.slip) }"
        >
          {{ (Math.abs(c.slip)).toFixed(1) }}
        </span>
      </div>
    </div>
  </div>
</template>
