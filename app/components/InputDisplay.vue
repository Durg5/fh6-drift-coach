<script setup lang="ts">
const props = defineProps<{
  throttle: number    // 0-255
  brake: number       // 0-255
  clutch: number      // 0-255
  steer: number       // -127 to 127
  handbrake: boolean
}>()

const tPct  = computed(() => Math.round(props.throttle / 255 * 100))
const bPct  = computed(() => Math.round(props.brake / 255 * 100))
const cPct  = computed(() => Math.round(props.clutch / 255 * 100))
const stPct = computed(() => Math.round(props.steer / 127 * 100))  // -100 to 100
</script>

<template>
  <div class="space-y-2">
    <!-- Throttle -->
    <div>
      <div class="flex justify-between mb-0.5">
        <span class="dc-lbl">THROTTLE</span>
        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-green);">{{ tPct }}%</span>
      </div>
      <div class="dc-bar-track">
        <div class="dc-bar-fill" :style="{ width: tPct + '%', background: 'var(--c-green)' }" />
      </div>
    </div>

    <!-- Brake -->
    <div>
      <div class="flex justify-between mb-0.5">
        <span class="dc-lbl">BRAKE</span>
        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-red);">{{ bPct }}%</span>
      </div>
      <div class="dc-bar-track">
        <div class="dc-bar-fill" :style="{ width: bPct + '%', background: 'var(--c-red)' }" />
      </div>
    </div>

    <!-- Clutch -->
    <div>
      <div class="flex justify-between mb-0.5">
        <span class="dc-lbl">CLUTCH</span>
        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-text-mid);">{{ cPct }}%</span>
      </div>
      <div class="dc-bar-track">
        <div class="dc-bar-fill" :style="{ width: cPct + '%', background: 'var(--c-text-mid)' }" />
      </div>
    </div>

    <!-- Steering (bidirectional) -->
    <div>
      <div class="flex justify-between mb-0.5">
        <span class="dc-lbl">STEER</span>
        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--c-data);">
          {{ stPct > 0 ? '+' : '' }}{{ stPct }}%
        </span>
      </div>
      <div class="dc-bar-track" style="position:relative;">
        <!-- left half fill -->
        <div
          v-if="stPct < 0"
          style="position:absolute; right:50%; top:0; bottom:0; border-radius:4px 0 0 4px; background:var(--c-data);"
          :style="{ width: Math.abs(stPct) / 2 + '%' }"
        />
        <!-- right half fill -->
        <div
          v-else
          style="position:absolute; left:50%; top:0; bottom:0; border-radius:0 4px 4px 0; background:var(--c-data);"
          :style="{ width: Math.abs(stPct) / 2 + '%' }"
        />
        <!-- Center line -->
        <div style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:rgba(255,255,255,0.12);" />
      </div>
    </div>

    <!-- Handbrake pill -->
    <div class="flex items-center gap-2 mt-1">
      <div
        class="flex-1 text-center"
        style="padding:0.2rem 0.5rem; border-radius:4px; font-family:var(--font-display); font-size:0.65rem; font-weight:700; letter-spacing:0.12em; border:1px solid;"
        :style="handbrake
          ? 'color:var(--c-drift); border-color:var(--c-drift); background:var(--c-drift-dim);'
          : 'color:var(--c-text-dim); border-color:rgba(255,255,255,0.05); background:transparent;'"
      >
        HANDBRAKE {{ handbrake ? 'ON' : 'OFF' }}
      </div>
    </div>
  </div>
</template>
