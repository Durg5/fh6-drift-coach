<script setup lang="ts">
const route = useRoute()
const { isRecording, isPaused, elapsedFormatted, frameCount } = useSessionRecorder()
const { carLabel } = useTune()

const links = [
  { to: '/',         label: 'Live',     icon: 'i-lucide-gauge' },
  { to: '/coach',    label: 'Coach',    icon: 'i-lucide-brain-circuit' },
  { to: '/tune',     label: 'Tune',     icon: 'i-lucide-sliders-horizontal' },
  { to: '/settings', label: 'Settings', icon: 'i-lucide-settings-2' },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <UApp>
    <div class="dc-app">
      <!-- Top accent line -->
      <div class="dc-accent" />

      <!-- Header: logo (left) · tabs (centered group, starting right of logo) · status (right) -->
      <header class="dc-header">
        <div class="dc-header-inner">

          <!-- Logo -->
          <NuxtLink to="/" class="dc-logo">
            <div class="dc-logo-mark">
              <UIcon name="i-lucide-flame" class="dc-logo-icon" />
            </div>
            <span class="dc-logo-text">
              DRIFT<span class="dc-logo-text-accent">COACH</span>
            </span>
          </NuxtLink>

          <!-- Separator between logo and tabs -->
          <div class="dc-header-sep" />

          <!-- Tabs spanning horizontally to the right of the logo -->
          <nav class="dc-tabs">
            <NuxtLink
              v-for="l in links"
              :key="l.to"
              :to="l.to"
              class="dc-tab"
              :class="isActive(l.to) ? 'dc-tab--active' : ''"
            >
              <UIcon :name="l.icon" class="dc-tab-icon" />
              <span class="dc-tab-label">{{ l.label }}</span>
            </NuxtLink>
          </nav>

          <!-- Right side: active car + REC + connection -->
          <div class="dc-header-right">
            <span v-if="carLabel" class="dc-garage-chip" title="Active car (tune/coach memory/sessions are siloed per car)">
              <UIcon name="i-lucide-car" class="dc-garage-icon" />
              {{ carLabel }}
            </span>
            <div v-if="isRecording" class="dc-rec" :class="isPaused ? 'dc-rec--paused' : ''">
              <span class="dc-rec-dot" />
              {{ isPaused ? 'PAUSED' : 'REC' }} {{ elapsedFormatted }} · {{ frameCount.toLocaleString() }}f
            </div>
            <ConnectionStatus />
          </div>
        </div>
      </header>

      <main class="dc-main">
        <slot />
      </main>
    </div>
  </UApp>
</template>

<style scoped>
.dc-app {
  min-height: 100vh;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: var(--font-body);
}
.dc-accent {
  height: 2px;
  background: linear-gradient(90deg, var(--c-drift) 0%, rgba(255, 85, 0, 0.3) 40%, transparent 80%);
}
.dc-header {
  background: rgba(8, 4, 16, 0.94);
  border-bottom: 1px solid var(--c-border-mid);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 2px;
  z-index: 50;
}
.dc-header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0.5rem 1rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: nowrap;
}

/* Logo */
.dc-logo {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  text-decoration: none;
  flex-shrink: 0;
}
.dc-logo-mark {
  width: 30px;
  height: 30px;
  border: 2px solid var(--c-drift);
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 85, 0, 0.08);
}
.dc-logo-icon { color: var(--c-drift); width: 16px; height: 16px; }
.dc-logo-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.06em;
  color: var(--c-text);
}
.dc-logo-text-accent {
  color: var(--c-drift);
  margin-left: 0.1em;
}

.dc-header-sep {
  width: 1px;
  height: 22px;
  background: var(--c-border-mid);
  flex-shrink: 0;
}

/* Tabs — spaced evenly, equal weight */
.dc-tabs {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}
.dc-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.85rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-text-mid);
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}
.dc-tab:hover {
  color: var(--c-text);
  background: rgba(255, 85, 0, 0.07);
  border-color: rgba(255, 85, 0, 0.18);
}
.dc-tab--active {
  color: var(--c-drift);
  background: rgba(255, 85, 0, 0.11);
  border-color: rgba(255, 85, 0, 0.32);
  box-shadow: inset 0 0 0 1px rgba(255, 85, 0, 0.06);
}
.dc-tab-icon { width: 13px; height: 13px; flex-shrink: 0; }

/* Right side */
.dc-header-right {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  flex-shrink: 0;
}
.dc-garage-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  background: rgba(0, 204, 255, 0.07);
  border: 1px solid rgba(0, 204, 255, 0.28);
  border-radius: 3px;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--c-data);
  text-transform: uppercase;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dc-garage-icon { width: 11px; height: 11px; flex-shrink: 0; }
.dc-rec {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-red);
}
.dc-rec-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--c-red);
  animation: dc-rec-blink 1.1s ease-in-out infinite;
}
.dc-rec--paused { color: var(--c-amber); }
.dc-rec--paused .dc-rec-dot {
  background: var(--c-amber);
  animation: dc-rec-blink 2.2s ease-in-out infinite;
}
@keyframes dc-rec-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Main content slot */
.dc-main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1rem;
}

/* Mobile compaction */
@media (max-width: 720px) {
  .dc-logo-text { display: none; }
  .dc-tab { padding: 0.42rem 0.55rem; font-size: 0.7rem; }
  .dc-tab-label { display: none; }
  .dc-garage-chip { display: none; }
}
</style>
