<script setup lang="ts">
useHead({ title: 'Settings — Drift Coach' })

interface ProviderStatus {
  hasKey?: boolean
  model?: string
  baseUrl?: string
  apiKey?: string
}
interface SettingsData {
  activeProvider: string
  inputDevice: 'controller' | 'wheel' | 'keyboard'
  ollamaCloud: ProviderStatus & { baseUrl: string; model: string }
  localOllama: { baseUrl: string; model: string }
  anthropic: ProviderStatus
  openai: ProviderStatus
}

const saved = ref<SettingsData | null>(null)
const saving = ref(false)
const saveFlash = ref<'ok' | 'err' | null>(null)

// Form state
const activeProvider = ref('ollama-cloud')
const inputDevice = ref<'controller' | 'wheel' | 'keyboard'>('controller')
const ollamaKey  = ref('')
const ollamaUrl  = ref('https://ollama.com/v1')
const ollamaModel = ref('minimax-m3:cloud')
const localUrl   = ref('http://localhost:11434/v1')
const localModel = ref('llama3.2')
const anthropicKey = ref('')
const openaiKey  = ref('')

const showOllamaKey    = ref(false)
const showAnthropicKey = ref(false)
const showOpenaiKey    = ref(false)

const PROVIDERS = [
  { id: 'ollama-cloud', label: 'Ollama Cloud', icon: 'i-lucide-cloud', desc: 'Hosted models via Ollama cloud API' },
  { id: 'local-ollama', label: 'Local Ollama', icon: 'i-lucide-server', desc: 'Self-hosted Ollama on your machine' },
  { id: 'anthropic',    label: 'Anthropic',    icon: 'i-lucide-sparkles', desc: 'Claude models via Anthropic API' },
  { id: 'openai',       label: 'OpenAI',        icon: 'i-lucide-bot', desc: 'GPT models via OpenAI API' },
]

async function fetchSettings() {
  try {
    const data = await $fetch<SettingsData>('/api/settings')
    saved.value = data
    activeProvider.value = data.activeProvider
    inputDevice.value = data.inputDevice ?? 'controller'
    ollamaUrl.value   = data.ollamaCloud.baseUrl
    ollamaModel.value = data.ollamaCloud.model
    localUrl.value    = data.localOllama.baseUrl
    localModel.value  = data.localOllama.model
  } catch {}
}

async function doSave() {
  saving.value = true
  saveFlash.value = null
  try {
    const body: Record<string, unknown> = {
      activeProvider: activeProvider.value,
      inputDevice: inputDevice.value,
      ollamaCloud: { baseUrl: ollamaUrl.value, model: ollamaModel.value },
      localOllama: { baseUrl: localUrl.value, model: localModel.value },
      anthropic: {},
      openai: {},
    }
    if (ollamaKey.value.trim())    body.ollamaCloud = { ...(body.ollamaCloud as object), apiKey: ollamaKey.value.trim() }
    if (anthropicKey.value.trim()) body.anthropic   = { apiKey: anthropicKey.value.trim() }
    if (openaiKey.value.trim())    body.openai       = { apiKey: openaiKey.value.trim() }

    await $fetch('/api/settings', { method: 'POST', body })
    ollamaKey.value = ''
    anthropicKey.value = ''
    openaiKey.value = ''
    await fetchSettings()
    saveFlash.value = 'ok'
  } catch {
    saveFlash.value = 'err'
  } finally {
    saving.value = false
    setTimeout(() => { saveFlash.value = null }, 3000)
  }
}

onMounted(fetchSettings)
</script>

<template>
  <div style="max-width:860px; margin:0 auto;">

    <!-- Page header -->
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.4rem;">
      <div style="width:32px; height:32px; border:1.5px solid var(--c-drift); border-radius:6px; display:flex; align-items:center; justify-content:center; background:var(--c-drift-dim);">
        <UIcon name="i-lucide-settings-2" style="color:var(--c-drift); width:16px; height:16px;" />
      </div>
      <div>
        <div style="font-family:var(--font-display); font-size:1.05rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">
          SETTINGS
        </div>
        <div style="font-size:0.72rem; color:var(--c-text-mid); margin-top:0.1rem;">
          AI provider configuration — keys stored locally, never committed
        </div>
      </div>
    </div>

    <!-- Input Device section -->
    <section style="margin-bottom:1.2rem;">
      <div class="s-heading">
        <UIcon name="i-lucide-gamepad-2" style="width:13px; height:13px;" />
        INPUT DEVICE
      </div>
      <div class="s-panel" style="padding:0.8rem 0.9rem;">
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0.5rem;">
          <button
            v-for="d in [
              { id: 'controller', label: 'Controller', icon: 'i-lucide-gamepad-2', desc: 'Gamepad — choppy steer is normal' },
              { id: 'wheel',      label: 'Wheel',      icon: 'i-lucide-disc-3',     desc: 'Wheel + pedals — smooth analog' },
              { id: 'keyboard',   label: 'Keyboard',   icon: 'i-lucide-keyboard',   desc: 'Binary on/off inputs' },
            ]"
            :key="d.id"
            class="prov-btn"
            :class="inputDevice === d.id ? 'prov-btn--active' : ''"
            @click="inputDevice = d.id as 'controller' | 'wheel' | 'keyboard'"
          >
            <UIcon :name="d.icon" style="width:15px; height:15px; flex-shrink:0;" />
            <div style="text-align:left;">
              <div style="font-weight:700; font-size:0.78rem; letter-spacing:0.06em;">{{ d.label }}</div>
              <div style="font-size:0.62rem; opacity:0.55; margin-top:1px;">{{ d.desc }}</div>
            </div>
          </button>
        </div>
        <div style="font-size:0.65rem; color:var(--c-text-mid); margin-top:0.55rem; line-height:1.4;">
          Tells the AI coach how to read steering / throttle / brake telemetry — controllers and keyboards produce naturally choppy inputs that aren't driver mistakes.
        </div>
      </div>
    </section>

    <!-- AI Provider section -->
    <section style="margin-bottom:1.2rem;">
      <div class="s-heading">
        <UIcon name="i-lucide-brain-circuit" style="width:13px; height:13px;" />
        AI PROVIDER
      </div>

      <!-- Provider picker -->
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem; margin-bottom:1rem;">
        <button
          v-for="p in PROVIDERS"
          :key="p.id"
          class="prov-btn"
          :class="activeProvider === p.id ? 'prov-btn--active' : ''"
          @click="activeProvider = p.id"
        >
          <UIcon :name="p.icon" style="width:15px; height:15px; flex-shrink:0;" />
          <div style="text-align:left;">
            <div style="font-weight:700; font-size:0.78rem; letter-spacing:0.06em;">{{ p.label }}</div>
            <div style="font-size:0.62rem; opacity:0.55; margin-top:1px;">{{ p.desc }}</div>
          </div>
        </button>
      </div>

      <!-- Ollama Cloud -->
      <div v-if="activeProvider === 'ollama-cloud'" class="s-panel">
        <div class="s-panel-title">Ollama Cloud Configuration</div>
        <div v-if="saved?.ollamaCloud.hasKey" class="s-status s-status--ok">
          <UIcon name="i-lucide-check-circle" style="width:12px; height:12px;" /> Key saved
        </div>
        <div class="s-grid">
          <div class="s-field">
            <label class="s-lbl">API Key</label>
            <div class="s-key-wrap">
              <input
                v-model="ollamaKey"
                :type="showOllamaKey ? 'text' : 'password'"
                class="s-inp s-inp--key"
                :placeholder="saved?.ollamaCloud.hasKey ? saved.ollamaCloud.apiKey : 'Enter Ollama API key...'"
              />
              <button class="s-eye" @click="showOllamaKey = !showOllamaKey">
                <UIcon :name="showOllamaKey ? 'i-lucide-eye-off' : 'i-lucide-eye'" style="width:13px; height:13px;" />
              </button>
            </div>
          </div>
          <div class="s-field">
            <label class="s-lbl">Base URL</label>
            <input v-model="ollamaUrl" type="text" class="s-inp" placeholder="https://ollama.com/v1" />
          </div>
          <div class="s-field">
            <label class="s-lbl">Model</label>
            <input v-model="ollamaModel" type="text" class="s-inp" placeholder="minimax-m3:cloud" />
          </div>
        </div>
      </div>

      <!-- Local Ollama -->
      <div v-else-if="activeProvider === 'local-ollama'" class="s-panel">
        <div class="s-panel-title">Local Ollama Configuration</div>
        <div class="s-status s-status--info">
          <UIcon name="i-lucide-info" style="width:12px; height:12px;" />
          No API key required — connects directly to your local instance
        </div>
        <div class="s-grid">
          <div class="s-field">
            <label class="s-lbl">Ollama URL</label>
            <input v-model="localUrl" type="text" class="s-inp" placeholder="http://localhost:11434/v1" />
          </div>
          <div class="s-field">
            <label class="s-lbl">Model</label>
            <input v-model="localModel" type="text" class="s-inp" placeholder="llama3.2" />
          </div>
        </div>
      </div>

      <!-- Anthropic -->
      <div v-else-if="activeProvider === 'anthropic'" class="s-panel">
        <div class="s-panel-title">Anthropic Configuration</div>
        <div v-if="saved?.anthropic.hasKey" class="s-status s-status--ok">
          <UIcon name="i-lucide-check-circle" style="width:12px; height:12px;" /> Key saved · Claude Sonnet 4.6
        </div>
        <div class="s-grid">
          <div class="s-field" style="grid-column:1/-1;">
            <label class="s-lbl">API Key</label>
            <div class="s-key-wrap">
              <input
                v-model="anthropicKey"
                :type="showAnthropicKey ? 'text' : 'password'"
                class="s-inp s-inp--key"
                :placeholder="saved?.anthropic.hasKey ? saved.anthropic.apiKey : 'sk-ant-...'"
              />
              <button class="s-eye" @click="showAnthropicKey = !showAnthropicKey">
                <UIcon :name="showAnthropicKey ? 'i-lucide-eye-off' : 'i-lucide-eye'" style="width:13px; height:13px;" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- OpenAI -->
      <div v-else-if="activeProvider === 'openai'" class="s-panel">
        <div class="s-panel-title">OpenAI Configuration</div>
        <div v-if="saved?.openai.hasKey" class="s-status s-status--ok">
          <UIcon name="i-lucide-check-circle" style="width:12px; height:12px;" /> Key saved · GPT-4o
        </div>
        <div class="s-grid">
          <div class="s-field" style="grid-column:1/-1;">
            <label class="s-lbl">API Key</label>
            <div class="s-key-wrap">
              <input
                v-model="openaiKey"
                :type="showOpenaiKey ? 'text' : 'password'"
                class="s-inp s-inp--key"
                :placeholder="saved?.openai.hasKey ? saved.openai.apiKey : 'sk-...'"
              />
              <button class="s-eye" @click="showOpenaiKey = !showOpenaiKey">
                <UIcon :name="showOpenaiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'" style="width:13px; height:13px;" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </section>

    <!-- All providers status -->
    <section style="margin-bottom:1.4rem;">
      <div class="s-heading">
        <UIcon name="i-lucide-activity" style="width:13px; height:13px;" />
        ALL PROVIDERS STATUS
      </div>
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:0.5rem;">
        <div v-for="p in PROVIDERS" :key="p.id" class="prov-status">
          <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.35rem;">
            <span
              style="width:6px; height:6px; border-radius:50%; flex-shrink:0;"
              :style="{
                background: p.id === 'local-ollama'
                  ? 'var(--c-green)'
                  : saved?.[p.id === 'ollama-cloud' ? 'ollamaCloud' : p.id === 'local-ollama' ? 'localOllama' : p.id as 'anthropic' | 'openai']?.hasKey
                    ? 'var(--c-green)' : 'var(--c-text-mid)'
              }"
            />
            <span style="font-family:var(--font-display); font-size:0.68rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
              {{ p.label }}
            </span>
          </div>
          <div style="font-size:0.62rem; color:var(--c-text-mid);">
            <template v-if="p.id === 'ollama-cloud'">
              {{ saved?.ollamaCloud.hasKey ? 'Key configured' : 'No key' }}
              <div style="margin-top:2px; font-family:var(--font-mono); font-size:0.58rem; opacity:0.6;">{{ saved?.ollamaCloud.model }}</div>
            </template>
            <template v-else-if="p.id === 'local-ollama'">
              Ready (no key needed)
              <div style="margin-top:2px; font-family:var(--font-mono); font-size:0.58rem; opacity:0.6;">{{ saved?.localOllama.model }}</div>
            </template>
            <template v-else-if="p.id === 'anthropic'">
              {{ saved?.anthropic.hasKey ? 'Key configured · claude-sonnet-4-6' : 'No key' }}
            </template>
            <template v-else-if="p.id === 'openai'">
              {{ saved?.openai.hasKey ? 'Key configured · gpt-4o' : 'No key' }}
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- Save button -->
    <div style="display:flex; align-items:center; gap:1rem;">
      <button class="s-save-btn" :disabled="saving" @click="doSave">
        <UIcon v-if="saving" name="i-lucide-loader-circle" style="width:14px; height:14px; animation:spin 0.8s linear infinite;" />
        <UIcon v-else name="i-lucide-save" style="width:14px; height:14px;" />
        {{ saving ? 'Saving…' : 'Save Settings' }}
      </button>
      <Transition name="flash">
        <div v-if="saveFlash === 'ok'" class="s-flash s-flash--ok">
          <UIcon name="i-lucide-check" style="width:12px; height:12px;" /> Saved to ~/.config/drift-coach/settings.json
        </div>
        <div v-else-if="saveFlash === 'err'" class="s-flash s-flash--err">
          <UIcon name="i-lucide-alert-triangle" style="width:12px; height:12px;" /> Save failed — check console
        </div>
      </Transition>
    </div>

    <!-- Storage note -->
    <div style="margin-top:1.4rem; padding:0.65rem 0.85rem; background:rgba(255,85,0,0.04); border:1px solid var(--c-border); border-radius:7px; font-size:0.7rem; color:var(--c-text-mid); display:flex; gap:0.5rem; align-items:flex-start;">
      <UIcon name="i-lucide-shield-check" style="width:13px; height:13px; color:var(--c-drift); flex-shrink:0; margin-top:1px;" />
      <span>
        Keys are stored locally at <code style="font-family:var(--font-mono); color:var(--c-data); font-size:0.68rem;">~/.config/drift-coach/settings.json</code>
        and are never logged, committed, or sent anywhere other than the respective provider's API endpoint.
        Leave an API key field blank to keep the existing saved value.
      </span>
    </div>

  </div>
</template>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

.s-heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-display);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--c-drift);
  margin-bottom: 0.7rem;
}

.prov-btn {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.65rem 0.75rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.14s;
  font-family: var(--font-display);
  color: var(--c-text-mid);
  text-align: left;
}
.prov-btn:hover {
  background: rgba(255,85,0,0.06);
  border-color: var(--c-border-mid);
  color: var(--c-text);
}
.prov-btn--active {
  background: rgba(255,85,0,0.09);
  border-color: rgba(255,85,0,0.45);
  color: var(--c-drift);
  box-shadow: 0 0 20px -6px var(--c-drift-glow);
}

.s-panel {
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--c-border-mid);
  border-radius: 9px;
  padding: 0.85rem 1rem;
}
.s-panel-title {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-text);
  margin-bottom: 0.75rem;
}

.s-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.68rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  margin-bottom: 0.75rem;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
}
.s-status--ok {
  background: rgba(0,230,118,0.08);
  border: 1px solid rgba(0,230,118,0.2);
  color: var(--c-green);
}
.s-status--info {
  background: rgba(0,204,255,0.06);
  border: 1px solid rgba(0,204,255,0.15);
  color: var(--c-data);
}

.s-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem 1rem;
}

.s-field { display: flex; flex-direction: column; gap: 0.3rem; }

.s-lbl {
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-text-mid);
}

.s-inp {
  width: 100%;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,85,0,0.2);
  border-radius: 6px;
  padding: 0.42rem 0.65rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--c-data);
  outline: none;
  transition: border-color 0.12s;
}
.s-inp:focus { border-color: rgba(255,85,0,0.5); box-shadow: 0 0 0 2px rgba(255,85,0,0.08); }
.s-inp::placeholder { color: var(--c-text-mid); opacity: 0.5; }
.s-inp--key { padding-right: 2.4rem; }

.s-key-wrap { position: relative; }
.s-eye {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--c-text-mid);
  display: flex;
  align-items: center;
  padding: 0;
  transition: color 0.1s;
}
.s-eye:hover { color: var(--c-drift); }

.prov-status {
  background: rgba(255,255,255,0.025);
  border: 1px solid var(--c-border);
  border-radius: 7px;
  padding: 0.6rem 0.75rem;
}

.s-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1.2rem;
  background: rgba(255,85,0,0.12);
  border: 1px solid rgba(255,85,0,0.4);
  border-radius: 7px;
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-drift);
  cursor: pointer;
  transition: all 0.13s;
}
.s-save-btn:hover:not(:disabled) {
  background: rgba(255,85,0,0.2);
  border-color: var(--c-drift);
  box-shadow: 0 0 18px -4px var(--c-drift-glow);
}
.s-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.s-flash {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  padding: 0.3rem 0.7rem;
  border-radius: 5px;
}
.s-flash--ok  { background: rgba(0,230,118,0.08); border: 1px solid rgba(0,230,118,0.2); color: var(--c-green); }
.s-flash--err { background: rgba(255,23,68,0.08);  border: 1px solid rgba(255,23,68,0.2);  color: var(--c-red); }

.flash-enter-active, .flash-leave-active { transition: opacity 0.25s; }
.flash-enter-from, .flash-leave-to { opacity: 0; }
</style>
