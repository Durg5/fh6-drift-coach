<script setup lang="ts">
defineProps<{
  susp: { fl: number; fr: number; rl: number; rr: number }
}>()

function suspColor(v: number): string {
  if (v > 0.85) return 'var(--c-red)'
  if (v > 0.65) return 'var(--c-amber)'
  if (v < 0.15) return 'var(--c-data)'
  return 'var(--c-green)'
}
</script>

<template>
  <div class="grid grid-cols-2 gap-x-3 gap-y-2">
    <div v-for="(val, key) in susp" :key="key">
      <div class="flex justify-between mb-0.5">
        <span class="dc-lbl" style="font-size:0.58rem;">{{ (key as string).toUpperCase() }}</span>
        <span style="font-family:var(--font-mono); font-size:0.65rem;" :style="{ color: suspColor(val) }">
          {{ Math.round(val * 100) }}%
        </span>
      </div>
      <div class="dc-bar-track" style="height:5px;">
        <div class="dc-bar-fill" :style="{ width: val * 100 + '%', background: suspColor(val), height: '100%' }" />
      </div>
    </div>
  </div>
</template>
