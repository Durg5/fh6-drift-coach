<script setup lang="ts">
const props = defineProps<{
  rpm: number
  rpmMax: number
  rpmIdle: number
}>()

const pct = computed(() => props.rpmMax > 0 ? Math.min(100, (props.rpm / props.rpmMax) * 100) : 0)
const isRedline = computed(() => pct.value > 90)
const isHigh    = computed(() => pct.value > 72)
const color     = computed(() => isRedline.value ? 'var(--c-red)' : isHigh.value ? 'var(--c-amber)' : 'var(--c-green)')
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between mb-1.5">
      <span class="dc-lbl">RPM</span>
      <div style="display:flex; align-items:baseline; gap:0.3rem;">
        <span
          style="font-family:var(--font-mono); font-size:1.05rem;"
          :style="{ color }"
          :class="isRedline ? 'live-dot' : ''"
        >{{ Math.round(rpm).toLocaleString() }}</span>
        <span style="font-family:var(--font-mono); font-size:0.62rem; color:var(--c-text-dim);">/ {{ Math.round(rpmMax).toLocaleString() }}</span>
      </div>
    </div>
    <div class="dc-bar-track" style="height:10px; position:relative;">
      <div
        class="dc-bar-fill"
        :style="{ width: pct + '%', background: color, boxShadow: isRedline ? `0 0 8px ${color}` : 'none' }"
        :class="isRedline ? 'live-dot' : ''"
      />
      <!-- Redline marker -->
      <div style="position:absolute; top:0; bottom:0; left:90%; width:1px; background:rgba(255,23,68,0.45);" />
    </div>
  </div>
</template>
