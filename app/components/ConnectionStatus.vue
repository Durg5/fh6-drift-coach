<script setup lang="ts">
const { wsStatus } = useTelemetry()

const label = computed(() => ({
  connecting: 'CONNECTING',
  live: 'LIVE',
  disconnected: 'OFFLINE',
}[wsStatus.value]))

const color = computed(() => ({
  connecting: 'var(--c-amber)',
  live: 'var(--c-green)',
  disconnected: 'var(--c-text-dim)',
}[wsStatus.value]))
</script>

<template>
  <div class="flex items-center gap-1.5" :style="{ color }">
    <span
      class="live-dot"
      style="width:6px; height:6px; border-radius:50%; display:inline-block; flex-shrink:0;"
      :style="{ background: color }"
    />
    <span style="font-family:var(--font-mono); font-size:0.62rem; letter-spacing:0.06em;">{{ label }}</span>
  </div>
</template>
