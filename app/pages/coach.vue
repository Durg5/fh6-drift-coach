<script setup lang="ts">
useHead({ title: 'Drift Coach — AI Coach' })

const {
  isRecording, isPaused, frameCount, elapsedFormatted, sessionStats,
  rollingFrameCount, rollingWindowFormatted,
  startRecording, stopRecording, exportSession, resetSession,
  getRollingAnalysis, getSessionAnalysis,
} = useSessionRecorder()

const { tune, tuneAsText, carKey, carLabel } = useTune()
const { revisions, tuneHistoryText, fetchRevisions } = useTuneRevisions()
const {
  sessions: savedSessions, selected: selectedSession, selectedId: selectedSessionId,
  saving: sessionSaving, saveFlash: sessionSaveFlash,
  saveCurrentSession, selectSession, deleteSession: deleteSavedSession,
  selectedAsContext: selectedSessionContext,
} = useSessionLog()

const {
  entries: memoryEntries, adding: memoryAdding,
  add: addMemory, remove: removeMemory,
  memoryAsText,
} = useCoachMemory()

const { refs: referenceTunes, libraryAsText, saveCurrentAsReference: saveRef } = useReferenceTunes()
const promotingSessionId = ref<string | null>(null)
const promotedSessionIds = ref<Set<string>>(new Set())

// Promote a saved session's tune to the reference library. Pulls the session's
// own tune snapshot + telemetry summary so the reference travels with the
// telemetry evidence that proved it works.
// ── Session A/B compare ──────────────────────────────────
const compareA = ref<string | null>(null)
const compareB = ref<string | null>(null)
const compareDataA = ref<{ stats: Record<string, unknown>; name: string; tuneSnapshot: Record<string, unknown> } | null>(null)
const compareDataB = ref<{ stats: Record<string, unknown>; name: string; tuneSnapshot: Record<string, unknown> } | null>(null)

async function loadCompareFull(id: string) {
  return await $fetch<{ stats: Record<string, unknown>; name: string; tuneSnapshot: Record<string, unknown> }>(`/api/sessions/${id}`)
}

async function toggleCompare(id: string) {
  if (compareA.value === id) { compareA.value = null; compareDataA.value = null; return }
  if (compareB.value === id) { compareB.value = null; compareDataB.value = null; return }
  if (!compareA.value) {
    compareA.value = id
    compareDataA.value = await loadCompareFull(id)
    return
  }
  compareB.value = id
  compareDataB.value = await loadCompareFull(id)
}
function clearCompare() {
  compareA.value = null; compareDataA.value = null
  compareB.value = null; compareDataB.value = null
}

const showCompare = computed(() => Boolean(compareDataA.value && compareDataB.value))

interface CompareRow { label: string; a: string | number; b: string | number; delta: string; better?: 'a' | 'b' | null }

function fmtNum(v: unknown, suffix = ''): string {
  if (typeof v === 'number') return (Math.round(v * 10) / 10).toString() + suffix
  return String(v ?? '—') + suffix
}
function deltaNum(a: unknown, b: unknown, suffix = '', higherIsBetter = true): { delta: string; better: 'a'|'b'|null } {
  const na = Number(a), nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return { delta: '—', better: null }
  const d = nb - na
  if (Math.abs(d) < 0.05) return { delta: '—', better: null }
  const sign = d > 0 ? '+' : ''
  return {
    delta: sign + (Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d).toString()) + suffix,
    better: d > 0 ? (higherIsBetter ? 'b' : 'a') : (higherIsBetter ? 'a' : 'b'),
  }
}

const compareRows = computed<CompareRow[]>(() => {
  const A = compareDataA.value?.stats
  const B = compareDataB.value?.stats
  if (!A || !B) return []
  const mkHi = (label: string, key: string, suffix = '') => {
    const { delta, better } = deltaNum(A[key], B[key], suffix, true)
    return { label, a: fmtNum(A[key], suffix), b: fmtNum(B[key], suffix), delta, better }
  }
  const mkLo = (label: string, key: string, suffix = '') => {
    const { delta, better } = deltaNum(A[key], B[key], suffix, false)
    return { label, a: fmtNum(A[key], suffix), b: fmtNum(B[key], suffix), delta, better }
  }
  return [
    mkHi('Drift score',         'driftScore'),
    mkHi('Drift time',           'driftTimeSec', 's'),
    mkHi('Drift %',              'driftTimePercent', '%'),
    mkHi('Max angle',            'maxDriftAngle', '°'),
    mkHi('Avg angle',            'avgDriftAngle', '°'),
    mkHi('Best sustained',       'bestSustainedDriftSec', 's'),
    mkHi('Counter-steer %',      'counterSteerPercent', '%'),
    mkLo('Snap overs',           'snapOvers'),
    mkLo('Spins',                'spins' as never),  // length below
    mkHi('Max speed',            'maxSpeedKmh', ' km/h'),
    mkHi('Avg speed',            'avgSpeedKmh', ' km/h'),
    mkLo('Max tire temp RL',     'maxTireTempRL', '°C'),
    mkLo('Max tire temp RR',     'maxTireTempRR', '°C'),
  ].map(r => {
    // special-case spins (use .length)
    if (r.label === 'Spins') {
      const an = Array.isArray(A.spins) ? A.spins.length : 0
      const bn = Array.isArray(B.spins) ? B.spins.length : 0
      const { delta, better } = deltaNum(an, bn, '', false)
      return { ...r, a: an, b: bn, delta, better }
    }
    return r
  })
})

async function promoteSessionToReference(sessionId: string) {
  if (promotingSessionId.value) return
  promotingSessionId.value = sessionId
  try {
    // Fetch the full session (includes tuneSnapshot + stats)
    const full = await $fetch<{
      name: string
      tuneSnapshot: Record<string, unknown>
      stats: Record<string, unknown>
    }>(`/api/sessions/${sessionId}`)
    const ts = full.tuneSnapshot
    const s = full.stats
    const dur = Math.round(Number(s.durationMs ?? 0) / 1000)
    const summary = `From session "${full.name}" (${dur}s). `
      + `Drift score ${s.driftScore}, time ${s.driftTimeSec}s (${s.driftTimePercent}%), `
      + `max angle ${s.maxDriftAngle}°, avg ${s.avgDriftAngle}°, `
      + `best sustained ${s.bestSustainedDriftSec}s, spins ${Array.isArray(s.spins) ? s.spins.length : 0}, `
      + `slip F${s.avgFrontCombinedSlipDrift}/R${s.avgRearCombinedSlipDrift}.`
    await $fetch('/api/reference-tunes', {
      method: 'POST',
      body: {
        label: `${ts.carName || 'unnamed'} — ${full.name}`,
        notes: `Promoted from session "${full.name}".`,
        carKey: String(ts.carKey ?? ''),
        carName: String(ts.carName ?? ''),
        carMake: ts.carMake, carYear: ts.carYear, carModel: ts.carModel,
        drivetrainType: ts.drivetrainType,
        piClass: ts.piClass, piNumber: ts.piNumber,
        tireCompound: ts.tireCompound,
        tune: ts,
        telemetrySummary: summary,
      },
    })
    promotedSessionIds.value = new Set([...promotedSessionIds.value, sessionId])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    promotingSessionId.value = null
  }
}
const memoryDraft = ref('')
const memoryConfirmDelete = ref<string | null>(null)
async function doAddMemory() {
  const t = memoryDraft.value.trim()
  if (!t || memoryAdding.value) return
  await addMemory(t, { sessionId: selectedSessionId.value ?? undefined })
  memoryDraft.value = ''
}

const sessionSaveName = ref('')
const sessionSaveNotes = ref('')
const showSaveForm = ref(false)
const confirmDeleteId = ref<string | null>(null)

// Build a sensible default session name from the active car + a short timestamp
// so saved sessions are never orphaned with a generic "Run @ 6/4/..." label.
// Format: "<car-label> · <feel?> · <HH:MM>" e.g. "2002 R34 GTR · GOOD · 14:32"
function defaultSessionName(): string {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const label = carLabel.value || tune.carName || 'unnamed car'
  const feel = tune.feel && tune.feel !== 'na' ? ` · ${tune.feel.toUpperCase()}` : ''
  return `${label}${feel} · ${hhmm}`
}

async function doSaveSession() {
  if (!sessionStats.value) return
  const name = sessionSaveName.value.trim() || defaultSessionName()
  await saveCurrentSession(name, sessionSaveNotes.value.trim() || undefined)
  sessionSaveName.value = ''
  sessionSaveNotes.value = ''
  showSaveForm.value = false
  // Revert recorder panel back to "ready to record" state — saved log lives in the sidebar now
  resetSession()
}

function doExportSession() {
  exportSession()
  resetSession()
}

// ── Providers ─────────────────────────────────────────────────
// IMPORTANT: do NOT use top-level `await useFetch` here. Any hydration mismatch
// or fetch hiccup would block the entire <script setup> from resolving — leaving
// the page apparently working but with silently dead send buttons. Use the
// non-blocking form and refresh on mount.
interface ProviderInfo { name: string; label: string; model: string; ready: boolean }
const { data: providerData, refresh: refreshProviders } =
  useFetch<{ default: string; available: ProviderInfo[] }>('/api/ai/providers', {
    default: () => ({ default: 'ollama-cloud', available: [] }),
  })
const provider = ref(providerData.value?.default ?? 'ollama-cloud')
const activeProvider = computed(() => providerData.value?.available.find(p => p.name === provider.value))

// Force a fresh fetch after mount so a stale SSR response from before a server
// fix can't poison provider readiness.
onMounted(() => { refreshProviders() })

// Canonical tuning guide status (server-injected; client just displays whether it loaded)
const { data: guideStatus } = useFetch<{ loaded: boolean; chars: number; estTokens: number }>('/api/tuning-guide/status', {
  default: () => ({ loaded: false, chars: 0, estTokens: 0 }),
})

// ── Chat ──────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  contextPreview?: string[]
}
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const sending = ref(false)
const error = ref<string | null>(null)
const chatEl = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null

function stopGeneration() {
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

// ── Per-car chat history (localStorage, keyed by carKey) ─────
// When the user fills in a different make/model in /tune, the chat list swaps
// to whatever conversation was saved for THAT car. Empty carKey = "no car"
// scratch pad. Nothing is persisted server-side — each car's conversation
// lives only in this browser.
const CHAT_KEY = (k: string) => `dc-chat::${k || '__nocar__'}`

function loadChatForCar(key: string) {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem(CHAT_KEY(key))
    messages.value = raw ? JSON.parse(raw) as ChatMessage[] : []
  } catch { messages.value = [] }
}

function persistChatForCar(key: string) {
  if (!import.meta.client) return
  try { localStorage.setItem(CHAT_KEY(key), JSON.stringify(messages.value)) }
  catch { /* quota exceeded — drop */ }
}

// Clear chat for the active car (manually-invoked from the "Clear" button)
function clearActiveChat() {
  messages.value = []
  if (import.meta.client) {
    try { localStorage.removeItem(CHAT_KEY(carKey.value)) } catch {}
  }
}

// Load on mount + whenever the active car changes
onMounted(() => loadChatForCar(carKey.value))
watch(carKey, (next, _prev) => {
  // Stop any in-flight stream — it belonged to the previous car
  stopGeneration()
  loadChatForCar(next)
})
// Persist on every change (deep — message arrays mutate during streaming)
watch(messages, () => persistChatForCar(carKey.value), { deep: true })

// ── Mode ──────────────────────────────────────────────────────
// 'tune-review' = analyze a SAVED session (with its attached tune) for tune recommendations
// 'live'        = live coaching off rolling telemetry + current tune (general tips, no recording required)
type CoachMode = 'tune-review' | 'live'
const mode = ref<CoachMode>('tune-review')

// Auto-switch to tune-review when user picks a session from the log
watch(selectedSessionId, (id) => { if (id) mode.value = 'tune-review' })

const SYSTEM_BASE = `You are a professional Forza Horizon 6 DRIFT coach.

## CRITICAL RULES (do not violate)
- THINK BRIEFLY. Target 30-90 seconds of reasoning, not 5 minutes. Diagnose, decide, recommend. Do NOT enumerate every possible interpretation. Do NOT second-guess once you've reached a conclusion.
- NO TOOLS. NO function calls. NO code execution. NO web search. You are a text-only coach reading attached context and replying.
- All context you need is in this conversation. Do not ask for more data — work with what's attached.
- Final answer should be ~250 words or under, plus the table and the tune-suggestion JSON block when applicable.

## Focus
You tune ONLY for drifting — never for grip racing, time attack, or drag. Grip-racing logic does NOT apply here. We WANT controlled rear breakaway, predictable angle hold, smooth transitions, and a wide rotation sweet-spot — not maximum lateral grip.

## Tune knowledge focus
- Drift diff (high accel %, moderate decel %), drift-soft springs F/R balance, dampers, ARB (usually F > R to plant rear), alignment, drift-compound tires (low rear PSI, low front PSI for grab), gearing, weight bias
- Drift TECHNIQUE: handbrake / clutch-kick / feint / scandi entries, angle control, throttle modulation, counter-steer timing
- Reading telemetry: BODY-SLIP angle vs steering input (not raw steer chop), yaw rate, slip ratios per corner, tire temps as balance signal, suspension TRAVEL ranges to infer roll/squat, wheel-speed deltas
- Diagnose from CAR behavior: snap-oversteer = damper imbalance or rear grip cliff, lazy entry = ARB/spring stiffness, mid-drift understeer = too much front grip or rear-tire overheat, tire overheating front = too much front grip pushing scrub

## CRITICAL: Camber + Springs are coupled
Soft rear springs SQUAT under cornering and acceleration, which dynamically ADDS 1-2° of negative camber to the rear under load. So:
- If you recommend SOFTER rear springs → recommend LESS static negative camber (often near 0° to slightly negative). The squat does the rest.
- If you recommend STIFFER rear springs → recommend MORE static negative camber, because the suspension doesn't gain camber gain under load.
- Same logic for the front (less pronounced). Always reason about contact patch UNDER DRIFT LOAD, not at static ride height.
- Drift tires want the patch flat during the slide. Too much static negative + soft springs = patch tilted off the ground = grip cliff and snap-overs.

## Reference tune library (ground truth)
A REFERENCE TUNE LIBRARY may be attached with known-good baseline tunes the driver has marked as DIALED. When a library is present:
- Treat those tunes as your strongest signal of what works in this game. If telemetry says "snap oversteer" but the closest reference handles similar G-loads cleanly with a softer rear ARB, reference that pattern explicitly.
- When recommending changes, NAME the closest matching baseline ("closest reference: 'R34 sweet spot' — your tune differs from it by 60 lb/in stiffer rear spring; suggest moving toward that direction") and explain HOW your suggestion converges on or diverges from it.
- Library tunes are LEARNED truth — prefer them over textbook drift heuristics when they conflict.

## Adaptive scale based on driver's FEEL rating
The driver may attach a FEEL rating with the tune. SCALE YOUR RECOMMENDATIONS to match:
- **GOOD** ("dialed") — the tune is in a sweet spot. Make ONLY minor refinements (±5-10% on parameters, never reverse direction). Target the single weakest signal in telemetry. Most of your reply should be "keep doing this" with one small tweak.
- **MEDIUM** ("workable") — directionally right but weak in places. Moderate corrections (15-25% on the weakest 2-3 parameters).
- **BAD** ("broken") — fundamental issues. Major overhaul OK: rethink direction, large value changes, possibly different diff/spring philosophy.
- **N/A** or absent — give full assessment from telemetry alone.
NEVER recommend an overhaul on a GOOD tune unless the telemetry shows a clear safety problem (chronic snap-overs, spinouts, brake-lock).

## NEVER suggest AWD
This driver always tunes RWD. Diff suggestions are REAR ONLY (accel %, decel %). Never propose an AWD swap, front-diff lock, or center-diff bias. Drivetrain conversions are off the table.

## Tune output order — match FH6's custom tuning order EXACTLY
When you produce a tune-comparison table or a recommendation list, the rows MUST follow this order, top to bottom:
1. Tires — Front PSI, Rear PSI
2. Gearing — Final Drive, then Gear 1 through last active gear
3. Alignment — Camber F, Camber R, Toe F, Toe R, Caster F
4. ARB — F, R
5. Springs — Spring rate F, Spring rate R, Ride height F, Ride height R
6. Damping — Rebound F, Rebound R, Bump F, Bump R
7. Aero — Splitter (front) and/or Wing (rear), only if the car has them. Skip entirely if aeroType is "none".
8. Brake — Balance %, Force %
9. Differential — Accel %, Decel % (rear only)

## How to format recommendations
- Lead with the top 2-3 issues from the data, then the fix. Don't lecture.
- Use ## section headers and numbered lists. Use **bold** for exact values.
- For tune comparison summaries, format as a markdown table in FH6 order:
  | Parameter | Current | Recommended | Why |
  |---|---|---|---|
  | Tire PSI F | 31.0 | **29.0** | bigger contact patch for grab on entry |
  | Tire PSI R | 30.0 | **27.0** | reduce rear grip cliff |
  | Final Drive | 3.40 | **3.78** | keep RPM in power band through G2-G3 |
- Be exact. "Lower rear spring 460 → **400 lb/in**" not "lower rear spring rate."

## Suggested-tune JSON block (REQUIRED in TUNE REVIEW mode)
At the END of any tune-review response that includes specific recommended values, emit a fenced code block tagged \`tune-suggestion\` containing a JSON object with ONLY the fields you are recommending changes to. Use these exact keys (omit any field you are not changing):

\`\`\`tune-suggestion
{
  "tirePressureF": 29.0, "tirePressureR": 27.0,
  "finalDrive": 3.78,
  "gear1": 3.4, "gear2": 2.2, "gear3": 1.55,
  "camberF": -2.5, "camberR": -1.0,
  "toeF": 0, "toeR": -0.2, "casterF": 7.0,
  "arbF": 25, "arbR": 8,
  "springRateF": 350, "springRateR": 400,
  "rideHeightF": 4.0, "rideHeightR": 4.2,
  "reboundF": 10, "reboundR": 9, "bumpF": 6, "bumpR": 5,
  "aeroFront": 200, "aeroRear": 180,
  "brakeBiasF": 60, "brakeForce": 100,
  "diffAccel": 80, "diffDecel": 25
}
\`\`\`
This block lets the suite save your recommendation as a new tune revision in one click. Do not wrap the JSON in any other markup. Include only fields whose values you actually recommend changing.

## Tone
Direct, technical, drift-focused. No filler, no input-style critique, no grip-racing tangents.`

const SYSTEM_TUNE_REVIEW = `\n\nMODE: TUNE REVIEW. A SAVED session is attached with the exact tune that was running + full telemetry stats. You have everything you need — do not ask for more data. Diagnose what worked, what failed (spin events + slip balance + tire temps + suspension travel), and give exact tune deltas for the next iteration. Be terse — top 3 issues, then the table, then the JSON block. No over-explanation.`

const SYSTEM_LIVE = `\n\nMODE: LIVE DIAGNOSTIC (chassis assessment).
The driver wants a fast assessment of what the CAR is currently doing — they have not committed to tuning this car yet and want to know if it's even worth tuning for drift. Only ~60 seconds of raw rolling telemetry is attached.

RULES:
- Do NOT reference tune values, springs, dampers, ARB, or any specific setup parameter — you don't have them and the driver doesn't want them in this analysis.
- Do NOT ask for tune/car/weight details.
- Focus ONLY on what the telemetry reveals about the chassis:
  * Drift willingness (slip balance, body angle response, yaw rate vs speed)
  * Throttle / lift behavior (does the car rotate cleanly or grip up)
  * Tire heat distribution and how hot rears are getting
  * Suspension travel range (squat / bottoming / pogo)
  * Counter-steer quality vs slip angle (chassis feel)
- Give a verdict at the end: GOOD DRIFT CANDIDATE / WORKABLE / FIGHTING IT — and one sentence why.
- Be terse, ~120 words total. No tables. No tune-suggestion JSON block.`

async function send(text?: string) {
  const msg = (text ?? draft.value).trim()
  // Log so DevTools shows the call site even if the visible UI fails to update
  // — was useful diagnosing the silent-send bug.
  console.log('[coach] send() called', { msgLen: msg.length, sending: sending.value, mode: mode.value, provider: provider.value })
  if (!msg) { console.warn('[coach] send aborted: empty message'); return }
  if (sending.value) { console.warn('[coach] send aborted: previous request still in-flight'); return }
  error.value = null

  const userMsg: ChatMessage = { role: 'user', content: msg }
  const next = [...messages.value, userMsg]
  messages.value = next
  draft.value = ''
  sending.value = true

  // Build context based on mode
  const extraCtx: string[] = []
  const contextPreview: string[] = []

  // ── Context-attachment policy by mode ──────────────────────
  // LIVE: pure-telemetry diagnostic. NO tune, NO memory, NO library, NO guide.
  //   The driver wants a fresh read on what the car is doing to decide if it's
  //   even worth tuning. Anything else just biases the answer.
  // TUNE REVIEW: everything attached — the AI uses the full knowledge stack.
  const isLive = mode.value === 'live'

  if (!isLive) {
    if (guideStatus.value?.loaded) {
      contextPreview.push(`Canonical drift guide: ${guideStatus.value.estTokens.toLocaleString()} tokens`)
    }
    if (memoryAsText.value) {
      extraCtx.push(`[${memoryAsText.value}]`)
      contextPreview.push(`Coach memory: ${memoryEntries.value.length} note${memoryEntries.value.length === 1 ? '' : 's'}`)
    }
    if (libraryAsText.value) {
      extraCtx.push(`[${libraryAsText.value}]`)
      contextPreview.push(`Reference library: ${referenceTunes.value.length} baseline tune${referenceTunes.value.length === 1 ? '' : 's'}`)
    }
  }

  if (mode.value === 'tune-review') {
    if (selectedSessionContext.value) {
      extraCtx.push(`[${selectedSessionContext.value}]`)
      contextPreview.push(`Saved session: "${selectedSession.value?.name}" + attached tune`)
    } else {
      // fall back to current tune + last in-memory session
      if (tuneAsText.value) {
        extraCtx.push(`[Current tune]\n${tuneAsText.value}`)
        contextPreview.push(`Current tune: ${tune.carName || 'unnamed'}`)
      }
      if (sessionStats.value) {
        extraCtx.push(`[Last recorded session]\n${getSessionAnalysis()}`)
        contextPreview.push(`Last unsaved session: ${sessionStats.value.frameCount} frames`)
      }
      if (revisions.value.length > 0) {
        extraCtx.push(`[${tuneHistoryText.value}]`)
        contextPreview.push(`Tune revisions: ${revisions.value.length}`)
      }
    }
  } else {
    // LIVE DIAGNOSTIC — pure telemetry, no tune, no memory, no library, no guide.
    const rolling = getRollingAnalysis()
    if (rolling) {
      extraCtx.push(`[Raw rolling drift telemetry — last ~60s. No tune or car data is attached intentionally; assess the chassis from this telemetry alone.]\n${rolling}`)
      contextPreview.push(`Live telemetry: ${rollingWindowFormatted.value} window (${rollingFrameCount.value} frames)`)
    } else {
      contextPreview.push('Live telemetry: no signal (drive in Forza to capture)')
    }
    contextPreview.push('Bare diagnostic mode — no tune / memory / library / guide attached')
  }

  // Attach assistant placeholder + context preview so the UI can show what we sent
  const assistantMsg: ChatMessage = {
    role: 'assistant', content: '', thinking: '', contextPreview,
  }
  messages.value = [...next, assistantMsg]
  const assistantIdx = messages.value.length - 1

  const augmentedLast: ChatMessage = extraCtx.length > 0
    ? { role: 'user', content: `${msg}\n\n${extraCtx.join('\n\n')}` }
    : userMsg
  const sendMessages = [...next.slice(0, -1), augmentedLast]
    .map(m => ({ role: m.role, content: m.content }))

  const systemPrompt = SYSTEM_BASE + (mode.value === 'tune-review' ? SYSTEM_TUNE_REVIEW : SYSTEM_LIVE)

  abortController = new AbortController()
  try {
    const res = await fetch('/api/ai/chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `bare: true` for live diagnostic tells the server to skip the canonical guide too —
      // pure telemetry-only chassis read with no book theory bleed.
      body: JSON.stringify({
        messages: sendMessages,
        system: systemPrompt,
        provider: provider.value,
        bare: isLive,
      }),
      signal: abortController.signal,
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let gotContent = false
    let gotThinking = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl
      while ((nl = buf.indexOf('\n\n')) !== -1) {
        const evt = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 2)
        if (!evt.startsWith('data:')) continue
        try {
          const data = JSON.parse(evt.slice(5).trim()) as { type: string; text?: string; error?: string }
          const cur = messages.value[assistantIdx]
          if (!cur) continue
          if (data.type === 'thinking_delta' && data.text) {
            cur.thinking = (cur.thinking ?? '') + data.text
            gotThinking = true
          } else if (data.type === 'content_delta' && data.text) {
            cur.content = cur.content + data.text
            gotContent = true
            await nextTick()
            if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
          } else if (data.type === 'error') {
            error.value = data.error ?? 'stream error'
            cur.content = cur.content || `(error: ${data.error ?? 'unknown'})`
          }
        } catch { /* skip */ }
      }
    }
    // Stream finished without any visible reply — happens when the model
    // exhausted its token budget on reasoning. Surface this so the user isn't left waiting.
    const cur = messages.value[assistantIdx]
    if (cur && !gotContent) {
      cur.content = gotThinking
        ? '_(The model exhausted its token budget on reasoning without producing a reply. Open THOUGHT PROCESS above to see what it was working through, or retry — usually retrying gives a normal answer.)_'
        : '_(No reply from the model. Check Settings and try again.)_'
    }
  } catch (e: unknown) {
    const err = e as Error
    if (err.name === 'AbortError') {
      const cur = messages.value[assistantIdx]
      if (cur) cur.content = cur.content || '(stopped)'
    } else {
      error.value = err.message
      const cur = messages.value[assistantIdx]
      if (cur) cur.content = cur.content || `(error: ${error.value})`
    }
  } finally {
    sending.value = false
    abortController = null
  }
}

const quickPrompts = [
  { label: 'Analyze session',  text: 'Analyze my last session and identify the biggest issues with my technique and tune.' },
  { label: 'Snap oversteer',   text: 'My car is snapping to oversteer mid-drift. What does the telemetry show and what tune changes fix it?' },
  { label: 'Entry technique',  text: 'Analyze my drift entries — am I initiating consistently and what should I adjust?' },
  { label: 'Tire temps',       text: 'What do my tire temperatures tell you about pressure and driving style?' },
  { label: 'Diff settings',    text: 'Given my telemetry and current diff settings, what accel/decel lock values would improve my drifting?' },
  { label: 'Full tune review', text: 'Do a full review of my tune and telemetry. Give me prioritized changes with exact values.' },
]

// Markdown renderer
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function renderInline(s: string) {
  return s
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>')
}
function renderMd(raw: string): string {
  const escapedLines = escapeHtml(raw).split('\n')
  const out: string[] = []
  let i = 0
  const isSep = (s: string) => /^\|[\s:|-]+\|$/.test(s.trim())
  const isRow = (s: string) => {
    const t = s.trim()
    return t.startsWith('|') && t.endsWith('|') && t.length > 2
  }
  const cells = (s: string) => s.trim().slice(1, -1).split('|').map(c => c.trim())

  while (i < escapedLines.length) {
    const line = escapedLines[i] ?? ''
    if (isRow(line) && i + 1 < escapedLines.length && isSep(escapedLines[i + 1] ?? '')) {
      const headers = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < escapedLines.length && isRow(escapedLines[i] ?? '')) {
        rows.push(cells(escapedLines[i] ?? ''))
        i++
      }
      const cols = headers.length
      const head = headers.map(h => `<div class="md-th">${renderInline(h)}</div>`).join('')
      const body = rows.map(r =>
        `<div class="md-tr">${r.map(c => `<div class="md-td">${renderInline(c)}</div>`).join('')}</div>`
      ).join('')
      out.push(`<div class="md-table" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr));"><div class="md-tr md-tr--head">${head}</div>${body}</div>`)
      continue
    }
    out.push(line)
    i++
  }

  let s = out.join('\n')
  s = s
    .replace(/^### (.+)$/gm, '<div class="md-h3">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="md-h2">$1</div>')
    .replace(/^# (.+)$/gm, '<div class="md-h1">$1</div>')
    .replace(/^---+$/gm, '<hr class="md-hr" />')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>')
    .replace(/^(\d+)\. (.+)$/gm, '<div class="md-num"><span class="md-num-idx">$1.</span><span>$2</span></div>')
    .replace(/^[-*] (.+)$/gm, '<div class="md-bul"><span class="md-bul-dot">•</span><span>$1</span></div>')
    .replace(/\n/g, '<br>')
  // Drop trailing <br> right after block-level divs (tables/headers/lists)
  s = s.replace(/(<\/div>)<br>/g, '$1')
  s = s.replace(/(<hr class="md-hr" \/>)<br>/g, '$1')
  return s
}

const hasTune = computed(() => tune.carName || tune.springRateF !== 400)

// Per-message thinking-panel open state
const thinkingOpen = ref<Record<number, boolean>>({})
function toggleThinking(i: number) {
  thinkingOpen.value = { ...thinkingOpen.value, [i]: !thinkingOpen.value[i] }
}

// ── Tune-suggestion parsing ──────────────────────────────────
const SUGGESTION_RE = /```tune-suggestion\s*\n([\s\S]*?)```/gi
function parseTuneSuggestion(content: string): Record<string, number | string> | null {
  const m = content.match(/```tune-suggestion\s*\n([\s\S]*?)```/i)
  if (!m) return null
  try {
    const parsed = JSON.parse((m[1] ?? '').trim())
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}
function stripSuggestion(content: string): string {
  return content.replace(SUGGESTION_RE, '').trim()
}

const acceptingIdx = ref<number | null>(null)
const acceptedIdx = ref<Set<number>>(new Set())
async function acceptSuggestion(i: number, suggestion: Record<string, number | string>) {
  if (acceptingIdx.value !== null) return
  acceptingIdx.value = i
  try {
    // CRITICAL: must operate on tune.value (the actual state object), NOT `tune`
    // (the useState Ref wrapper). Earlier bug spread the Ref itself into the saved
    // revision, which embedded the entire app state (_object, _raw) into the file
    // and crashed /tune when Vue's reactivity walked into the malformed object.
    const tuneState = tune.value as Record<string, unknown>
    for (const [k, v] of Object.entries(suggestion)) {
      if (k in tuneState) tuneState[k] = v
    }
    const carName = (tune.value.carName || 'tune').toString()
    const stamp = new Date().toLocaleString('en-CA', { hour12: false }).replace(',', '')
    const name = `Coach suggestion · ${carName} · ${stamp}`
    // Send a clean plain-object snapshot (NOT { ...tune } which spreads the Ref).
    await $fetch('/api/revisions', {
      method: 'POST',
      body: { name, tune: { ...tune.value } },
    })
    await fetchRevisions()
    acceptedIdx.value = new Set([...acceptedIdx.value, i])
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    acceptingIdx.value = null
  }
}
</script>

<template>
  <div class="coach-layout">

    <!-- ── Top bar ──────────────────────────────────────────── -->
    <div class="coach-topbar">
      <!-- Left: title + active model -->
      <div class="coach-title-group">
        <h1 class="coach-title">AI DRIFT COACH</h1>
        <span class="coach-model">
          {{ activeProvider?.label ?? provider }}
          <span class="coach-model-id">{{ activeProvider?.model }}</span>
        </span>
        <span v-if="!carKey" class="coach-garage-warn">
          <UIcon name="i-lucide-alert-circle" style="width:11px;height:11px;" />
          <NuxtLink to="/tune" class="coach-garage-link">no car set — fill in /tune to silo chats</NuxtLink>
        </span>
      </div>

      <!-- Center: provider tabs -->
      <div class="coach-providers">
        <button
          v-for="p in providerData?.available ?? []"
          :key="p.name"
          class="dc-nav-tab"
          :class="provider === p.name ? 'dc-nav-tab--active' : ''"
          :disabled="!p.ready"
          :style="!p.ready ? 'opacity:0.28;cursor:not-allowed;' : ''"
          style="padding:0.18rem 0.55rem; font-size:0.66rem;"
          @click="p.ready && (provider = p.name)"
        >{{ p.label }}</button>
      </div>

      <!-- Right: clear -->
      <button class="coach-clear-btn" @click="clearActiveChat(); error = null">CLEAR</button>
    </div>

    <!-- ── Body: chat + sidebar ─────────────────────────────── -->
    <div class="coach-body">

      <!-- CHAT -->
      <div class="coach-chat dc-card dc-card--drift">
        <div class="dc-topbar" />
        <div class="dc-b dc-b--tl" />
        <div class="dc-b dc-b--tr" />
        <div class="dc-b dc-b--bl" />
        <div class="dc-b dc-b--br" />

        <!-- Messages -->
        <div ref="chatEl" class="chat-messages">

          <!-- Empty state -->
          <div v-if="!messages.length" class="chat-empty">
            <UIcon name="i-lucide-flame" class="chat-empty-icon" />
            <div class="chat-empty-title">DRIFT COACH READY</div>
            <p class="chat-empty-body">
              Rolling telemetry and your tune attach automatically.<br>
              Record a session for in-depth analysis.
            </p>
            <div class="chat-quick-prompts">
              <button
                v-for="q in quickPrompts"
                :key="q.label"
                class="chat-quick-btn"
                @click="send(q.text)"
              >{{ q.label }}</button>
            </div>
          </div>

          <!-- Message list -->
          <template v-else>
            <div
              v-for="(m, i) in messages"
              :key="i"
              class="chat-msg"
              :class="m.role === 'user' ? 'chat-msg--user' : 'chat-msg--ai'"
            >
              <div class="chat-msg-role" :class="m.role === 'user' ? 'role-user' : 'role-ai'">
                {{ m.role === 'user' ? 'DRIVER' : 'DRIFT COACH' }}
                <span v-if="m.role === 'assistant' && sending && i === messages.length - 1 && !m.content" class="role-status">
                  <span class="status-dot status-dot--pulse" />
                  thinking…
                </span>
                <span v-else-if="m.role === 'assistant' && sending && i === messages.length - 1" class="role-status">
                  <span class="status-dot status-dot--writing" />
                  writing
                </span>
              </div>

              <!-- Context preview: what the coach is reading -->
              <div v-if="m.role === 'assistant' && m.contextPreview?.length" class="ctx-preview">
                <div class="ctx-preview-title">
                  <UIcon name="i-lucide-eye" style="width:11px;height:11px;" />
                  READING
                </div>
                <ul class="ctx-preview-list">
                  <li v-for="(c, ci) in m.contextPreview" :key="ci">{{ c }}</li>
                </ul>
              </div>

              <!-- Thinking box: real chain-of-thought, collapsible -->
              <div v-if="m.role === 'assistant' && m.thinking" class="think-box">
                <button
                  class="think-toggle"
                  @click="toggleThinking(i)"
                  :class="{ 'think-toggle--open': thinkingOpen[i] ?? (sending && i === messages.length - 1) }"
                >
                  <UIcon name="i-lucide-brain" style="width:11px;height:11px;" />
                  <span class="think-toggle-label">
                    {{ sending && i === messages.length - 1 ? 'THINKING' : 'THOUGHT PROCESS' }}
                  </span>
                  <span v-if="sending && i === messages.length - 1" class="think-pulse" />
                  <UIcon
                    :name="(thinkingOpen[i] ?? (sending && i === messages.length - 1)) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    style="width:11px;height:11px;margin-left:auto;"
                  />
                </button>
                <div v-if="thinkingOpen[i] ?? (sending && i === messages.length - 1)" class="think-body">{{ m.thinking }}</div>
              </div>

              <div v-if="m.role === 'user'" class="chat-msg-text">{{ m.content }}</div>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-else-if="m.content" class="chat-msg-text md-body" v-html="renderMd(stripSuggestion(m.content))" />

              <!-- Accept-tune action: appears when AI emitted a tune-suggestion JSON block -->
              <div
                v-if="m.role === 'assistant' && parseTuneSuggestion(m.content)"
                class="accept-card"
              >
                <div class="accept-card-row">
                  <div class="accept-card-info">
                    <UIcon name="i-lucide-wrench" style="width:13px;height:13px;color:var(--c-drift);" />
                    <div>
                      <div class="accept-card-title">SUGGESTED TUNE READY</div>
                      <div class="accept-card-sub">
                        {{ Object.keys(parseTuneSuggestion(m.content) || {}).length }} parameters —
                        applies to live tune + saves as a revision
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="!acceptedIdx.has(i)"
                    class="accept-btn"
                    :disabled="acceptingIdx === i"
                    @click="acceptSuggestion(i, parseTuneSuggestion(m.content)!)"
                  >
                    <UIcon
                      :name="acceptingIdx === i ? 'i-lucide-loader-circle' : 'i-lucide-bookmark-plus'"
                      :style="acceptingIdx === i ? 'width:12px;height:12px;animation:spin 0.7s linear infinite;' : 'width:12px;height:12px;'"
                    />
                    {{ acceptingIdx === i ? 'APPLYING…' : 'ACCEPT TUNE → APPLY + SAVE' }}
                  </button>
                  <div v-else class="accept-done">
                    <UIcon name="i-lucide-check-circle-2" style="width:13px;height:13px;color:var(--c-green);" />
                    APPLIED — set these in Forza, then record
                  </div>
                </div>
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="chat-error">{{ error }}</div>
          </template>
        </div>

        <!-- Mode toggle -->
        <div class="mode-bar">
          <button
            class="mode-btn"
            :class="mode === 'tune-review' ? 'mode-btn--active' : ''"
            @click="mode = 'tune-review'"
          >
            <UIcon name="i-lucide-wrench" style="width:12px;height:12px;" />
            TUNE REVIEW
          </button>
          <button
            class="mode-btn"
            :class="mode === 'live' ? 'mode-btn--active' : ''"
            @click="mode = 'live'"
          >
            <UIcon name="i-lucide-radio" style="width:12px;height:12px;" />
            LIVE DIAGNOSTIC
          </button>
          <div class="mode-hint">
            <template v-if="mode === 'tune-review'">
              <UIcon v-if="selectedSession" name="i-lucide-check-circle-2" style="width:11px;height:11px;color:var(--c-green);" />
              <UIcon v-else name="i-lucide-alert-circle" style="width:11px;height:11px;color:var(--c-amber);" />
              <span v-if="selectedSession">Analyzing "{{ selectedSession.name }}" + attached tune</span>
              <span v-else>Pick a saved session in the log →</span>
            </template>
            <template v-else>
              <UIcon name="i-lucide-radio" style="width:11px;height:11px;color:var(--c-data);" />
              Bare diagnostic — ~60s telemetry only, no tune/memory/library
            </template>
          </div>
        </div>

        <!-- Persistent error banner — always shows when set so silent-send bugs are visible -->
        <div v-if="error" class="chat-error chat-error--persistent">
          <UIcon name="i-lucide-triangle-alert" style="width:12px;height:12px;flex-shrink:0;" />
          {{ error }}
          <button @click="error = null" style="margin-left:auto;background:transparent;border:none;color:inherit;cursor:pointer;font-family:var(--font-mono);font-size:0.7rem;">✕</button>
        </div>

        <!-- Input -->
        <div class="chat-input-bar">
          <div class="chat-input-form">
            <textarea
              v-model="draft"
              class="chat-textarea"
              :placeholder="mode === 'tune-review' ? 'Ask for a tune review or specific change…' : 'Ask for live coaching tips…'"
              rows="2"
              :disabled="sending"
              autocomplete="off"
              @keydown.enter.exact.prevent="send()"
            />
            <button
              v-if="!sending"
              class="chat-send-btn"
              :disabled="!draft.trim()"
              @click="send()"
            >
              <UIcon name="i-lucide-send" style="width:13px;height:13px;" />
              SEND
            </button>
            <button
              v-else
              class="chat-send-btn chat-stop-btn"
              @click="stopGeneration"
            >
              <UIcon name="i-lucide-square" style="width:11px;height:11px;" />
              STOP
            </button>
          </div>
        </div>
      </div>

      <!-- SIDEBAR -->
      <div class="coach-sidebar">

        <!-- Session recording -->
        <div class="dc-card sidebar-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Session</div>
          <div class="sidebar-body">

            <template v-if="!isRecording && !sessionStats">
              <button class="rec-btn rec-wide" @click="startRecording">
                <span class="rec-dot" />
                START RECORDING
              </button>
            </template>

            <template v-else-if="isRecording">
              <div class="rec-timer live-dot" :class="isPaused ? 'rec-timer--paused' : ''">
                ● {{ isPaused ? 'PAUSED' : '' }} {{ elapsedFormatted }} · {{ frameCount.toLocaleString() }}f
              </div>
              <button class="rec-btn rec-btn--stop rec-wide" @click="stopRecording">■ STOP</button>
            </template>

            <template v-else-if="sessionStats">
              <div class="session-score">
                <div class="t-lbl">DRIFT SCORE</div>
                <div class="session-score-val">{{ sessionStats.driftScore.toLocaleString() }}</div>
              </div>
              <div class="session-stats">
                <div class="sstat"><span>MAX ANGLE</span><span style="color:var(--c-drift);">{{ sessionStats.maxDriftAngle }}°</span></div>
                <div class="sstat"><span>AVG ANGLE</span><span style="color:var(--c-amber);">{{ sessionStats.avgDriftAngle }}°</span></div>
                <div class="sstat"><span>DRIFT TIME</span><span style="color:var(--c-data);">{{ sessionStats.driftTimeSec }}s · {{ sessionStats.driftTimePercent }}%</span></div>
                <div class="sstat"><span>BEST SUSTAIN</span><span style="color:var(--c-green);">{{ sessionStats.bestSustainedDriftSec }}s</span></div>
                <div class="sstat"><span>SNAP OVERS</span><span :style="{ color: sessionStats.snapOvers > 3 ? 'var(--c-red)' : 'var(--c-text-mid)' }">{{ sessionStats.snapOvers }}</span></div>
                <div class="sstat"><span>HB ENTRIES</span><span>{{ sessionStats.handbrakeEntries }}</span></div>
                <div class="sstat"><span>C-STEER</span><span :style="{ color: sessionStats.counterSteerPercent > 60 ? 'var(--c-green)' : 'var(--c-amber)' }">{{ sessionStats.counterSteerPercent }}%</span></div>
              </div>
              <div class="session-actions">
                <button class="rec-btn" style="flex:1;justify-content:center;font-size:0.6rem;" @click="startRecording">● NEW</button>
                <button
                  class="rec-btn rec-btn--save"
                  style="flex:1;justify-content:center;font-size:0.6rem;"
                  @click="showSaveForm = !showSaveForm; if (showSaveForm && !sessionSaveName) sessionSaveName = defaultSessionName()"
                >
                  <UIcon name="i-lucide-save" style="width:11px;height:11px;" />
                  SAVE
                </button>
                <button class="rec-btn rec-btn--stop" style="flex:1;justify-content:center;font-size:0.6rem;" @click="doExportSession">↓ EXPORT</button>
              </div>
              <div v-if="showSaveForm" class="save-form">
                <div v-if="!carKey" class="save-warn">
                  <UIcon name="i-lucide-alert-triangle" style="width:11px;height:11px;color:var(--c-amber);flex-shrink:0;" />
                  <span>No car set — this session will be unfiltered. <NuxtLink to="/tune" style="color:var(--c-amber);">Fill in /tune</NuxtLink></span>
                </div>
                <input v-model="sessionSaveName" class="save-input" placeholder="Session name (e.g. Switchback uphill r3)" />
                <input v-model="sessionSaveNotes" class="save-input" placeholder="Notes (optional)" />
                <button class="rec-btn rec-btn--save rec-wide" :disabled="sessionSaving" @click="doSaveSession">
                  <UIcon v-if="sessionSaving" name="i-lucide-loader-circle" style="width:11px;height:11px;animation:spin 1s linear infinite;" />
                  <UIcon v-else name="i-lucide-check" style="width:11px;height:11px;" />
                  {{ sessionSaving ? 'SAVING…' : 'CONFIRM SAVE' }}
                </button>
                <div v-if="sessionSaveFlash" class="save-flash">✓ Saved to log</div>
              </div>
            </template>

          </div>
        </div>

        <!-- Context -->
        <div class="dc-card sidebar-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Context</div>
          <div class="sidebar-body" style="gap:0.5rem;">

            <div class="ctx-row">
              <div class="ctx-info">
                <div class="ctx-name">Rolling</div>
                <div class="ctx-detail">
                  <span v-if="rollingFrameCount > 0" style="color:var(--c-green);">{{ rollingWindowFormatted }} · {{ rollingFrameCount }}f</span>
                  <span v-else style="color:var(--c-text-dim);">no signal</span>
                </div>
              </div>
              <UToggle v-model="attachRolling" size="sm" />
            </div>

            <div class="ctx-row">
              <div class="ctx-info">
                <div class="ctx-name" :style="{ color: sessionStats ? 'var(--c-text)' : 'var(--c-text-dim)' }">Session</div>
                <div class="ctx-detail">
                  <span v-if="sessionStats" style="color:var(--c-text-mid);">{{ sessionStats.frameCount.toLocaleString() }}f</span>
                  <span v-else style="color:var(--c-text-dim);">record first</span>
                </div>
              </div>
              <UToggle v-model="attachSession" size="sm" :disabled="!sessionStats" />
            </div>

            <div class="ctx-row">
              <div class="ctx-info">
                <div class="ctx-name" :style="{ color: selectedSession ? 'var(--c-text)' : 'var(--c-text-dim)' }">Saved log</div>
                <div class="ctx-detail">
                  <span v-if="selectedSession" style="color:var(--c-drift);">{{ selectedSession.name }}</span>
                  <span v-else style="color:var(--c-text-dim);">pick one below</span>
                </div>
              </div>
              <UToggle v-model="attachSavedSession" size="sm" :disabled="!selectedSession" />
            </div>

            <div class="ctx-row">
              <div class="ctx-info">
                <div class="ctx-name">Tune</div>
                <div class="ctx-detail">
                  <span v-if="hasTune" style="color:var(--c-text-mid);">
                    {{ tune.carName || 'unnamed' }}
                    <span v-if="revisions.length" style="color:var(--c-drift); margin-left:0.3rem;">· {{ revisions.length }}rev</span>
                  </span>
                  <span v-else>
                    <NuxtLink to="/tune" style="color:var(--c-amber); text-decoration:none;">fill in Tune tab →</NuxtLink>
                  </span>
                </div>
              </div>
              <UToggle v-model="attachTune" size="sm" />
            </div>

          </div>
        </div>

        <!-- Coach Memory (adaptive feedback) -->
        <div class="dc-card sidebar-card mem-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Coach Memory</div>
          <div class="sidebar-body mem-body">
            <div class="mem-input-row">
              <textarea
                v-model="memoryDraft"
                class="mem-input"
                placeholder="Add a lesson (e.g. 'stiff rear ARB caused snap at 80kph')"
                rows="2"
                @keydown.ctrl.enter.prevent="doAddMemory"
                @keydown.meta.enter.prevent="doAddMemory"
              />
              <button
                class="mem-add-btn"
                :disabled="!memoryDraft.trim() || memoryAdding"
                @click="doAddMemory"
              >
                <UIcon
                  :name="memoryAdding ? 'i-lucide-loader-circle' : 'i-lucide-brain'"
                  :style="memoryAdding ? 'width:11px;height:11px;animation:spin 0.7s linear infinite;' : 'width:11px;height:11px;'"
                />
                REMEMBER
              </button>
            </div>
            <div v-if="!memoryEntries.length" class="mem-empty">
              Memory shapes every future answer. Tell the coach what worked, what didn't, what felt wrong.
            </div>
            <div v-else class="mem-list">
              <div v-for="m in memoryEntries.slice(0, 8)" :key="m.id" class="mem-item">
                <div class="mem-item-text">{{ m.text }}</div>
                <div class="mem-item-foot">
                  <span class="mem-item-meta">{{ m.carName || '—' }}</span>
                  <button
                    class="mem-item-del"
                    :class="memoryConfirmDelete === m.id ? 'mem-item-del--confirm' : ''"
                    @click="memoryConfirmDelete === m.id ? (removeMemory(m.id), memoryConfirmDelete = null) : (memoryConfirmDelete = m.id)"
                  >
                    {{ memoryConfirmDelete === m.id ? '✓?' : '✕' }}
                  </button>
                </div>
              </div>
              <div v-if="memoryEntries.length > 8" class="mem-more">
                + {{ memoryEntries.length - 8 }} more in memory
              </div>
            </div>
          </div>
        </div>

        <!-- Saved Sessions Log -->
        <div class="dc-card sidebar-card session-log-card">
          <div class="dc-topbar" />
          <div class="dc-b dc-b--tl" />
          <div class="dc-b dc-b--br" />
          <div class="dc-label">Session Log</div>
          <div class="sidebar-body session-log-body">
            <div v-if="!savedSessions.length" class="log-empty">
              No saved sessions yet. Record a run, click <span class="kbd">SAVE</span>, and they show up here with the tune attached.
            </div>

            <!-- Session compare inline panel — A vs B side-by-side stat deltas + dual mini-maps -->
            <Transition name="cmp-fade">
              <div v-if="showCompare" class="cmp-panel">
                <div class="cmp-header">
                  <div class="cmp-title">
                    <UIcon name="i-lucide-git-compare" style="width:11px;height:11px;color:var(--c-drift);" />
                    SESSION COMPARE
                  </div>
                  <button class="cmp-close" @click="clearCompare">✕</button>
                </div>
                <div class="cmp-names">
                  <div class="cmp-name cmp-name--a">A: {{ compareDataA?.name }}</div>
                  <div class="cmp-name cmp-name--b">B: {{ compareDataB?.name }}</div>
                </div>
                <div class="cmp-maps">
                  <div class="cmp-map"><SessionMiniMap :stats="(compareDataA?.stats as any)" /></div>
                  <div class="cmp-map"><SessionMiniMap :stats="(compareDataB?.stats as any)" /></div>
                </div>
                <div class="cmp-table">
                  <div
                    v-for="(r, i) in compareRows" :key="i"
                    class="cmp-row"
                  >
                    <span class="cmp-row-lbl">{{ r.label }}</span>
                    <span class="cmp-row-a" :class="r.better === 'a' ? 'cmp-row--better' : ''">{{ r.a }}</span>
                    <span class="cmp-row-b" :class="r.better === 'b' ? 'cmp-row--better' : ''">{{ r.b }}</span>
                    <span class="cmp-row-d" :class="r.better === 'b' ? 'cmp-row-d--better' : r.better === 'a' ? 'cmp-row-d--worse' : ''">{{ r.delta }}</span>
                  </div>
                </div>
              </div>
            </Transition>

            <div v-if="savedSessions.length" class="log-list">
              <div
                v-for="s in savedSessions"
                :key="s.id"
                class="log-item"
                :class="selectedSessionId === s.id ? 'log-item--active' : ''"
                @click="selectSession(selectedSessionId === s.id ? null : s.id)"
              >
                <div class="log-item-row1">
                  <div class="log-item-name">{{ s.name }}</div>
                  <span v-if="s.feel && s.feel !== 'na'" class="log-feel" :data-feel="s.feel">
                    {{ s.feel === 'good' ? 'GOOD' : s.feel === 'medium' ? 'MED' : 'BAD' }}
                  </span>
                  <div class="log-item-score">{{ s.driftScore.toLocaleString() }}</div>
                </div>
                <div class="log-item-row2">
                  <span class="log-item-car">{{ s.carName || '?' }} · {{ s.piClass }}</span>
                  <span class="log-item-sep">·</span>
                  <span>{{ Math.floor(s.durationSec / 60) }}m {{ s.durationSec % 60 }}s</span>
                  <span class="log-item-sep">·</span>
                  <span style="color:var(--c-drift);">{{ s.maxAngle }}°</span>
                  <span class="log-item-sep">·</span>
                  <span style="color:var(--c-data);">{{ s.driftTimeSec }}s drift</span>
                  <span v-if="s.spinCount > 0" class="log-item-sep">·</span>
                  <span v-if="s.spinCount > 0" style="color:var(--c-red);">{{ s.spinCount }} spin{{ s.spinCount > 1 ? 's' : '' }}</span>
                </div>
                <!-- Mini-map + top chains preview: only when row is selected.
                     Pulled from the loaded full session (selected.value). -->
                <div
                  v-if="selectedSessionId === s.id && selectedSession?.stats"
                  class="log-detail"
                  @click.stop
                >
                  <div class="log-detail-map">
                    <SessionMiniMap :stats="selectedSession.stats" />
                  </div>
                  <div v-if="selectedSession.stats.topChains?.length" class="log-detail-chains">
                    <div class="log-detail-title">TOP CHAINS</div>
                    <div
                      v-for="(c, ci) in selectedSession.stats.topChains"
                      :key="ci"
                      class="log-chain"
                    >
                      <span class="log-chain-rank">#{{ ci + 1 }}</span>
                      <span class="log-chain-dur">{{ c.durationSec }}s</span>
                      <span class="log-chain-stats">
                        <span style="color:var(--c-drift);">{{ c.peakAngle }}°</span>
                        @
                        <span style="color:var(--c-data);">{{ c.peakSpeedKmh }} km/h</span>
                      </span>
                      <span class="log-chain-score">{{ c.score.toLocaleString() }}</span>
                    </div>
                  </div>
                </div>

                <div class="log-item-row3">
                  <!-- Quick: promote this session's tune snapshot to reference library.
                       Shown for any session — but glows green when feel=GOOD as a strong hint. -->
                  <button
                    v-if="!promotedSessionIds.has(s.id)"
                    class="log-promote"
                    :class="s.feel === 'good' ? 'log-promote--hot' : ''"
                    :disabled="promotingSessionId === s.id"
                    title="Promote this session's tune to the Reference Library so the AI sees it as a known-good baseline"
                    @click.stop="promoteSessionToReference(s.id)"
                  >
                    <UIcon
                      :name="promotingSessionId === s.id ? 'i-lucide-loader-circle' : 'i-lucide-star'"
                      :style="promotingSessionId === s.id ? 'width:11px;height:11px;animation:spin 0.7s linear infinite;' : 'width:11px;height:11px;'"
                    />
                    {{ promotingSessionId === s.id ? '' : 'REFERENCE' }}
                  </button>
                  <span v-else class="log-promoted">
                    <UIcon name="i-lucide-check-circle-2" style="width:11px;height:11px;color:var(--c-green);" />
                    REFERENCED
                  </span>
                  <!-- Session compare: first click → A, second click (different session) → B -->
                  <button
                    class="log-compare"
                    :class="{
                      'log-compare--a': compareA === s.id,
                      'log-compare--b': compareB === s.id,
                    }"
                    :title="compareA === s.id ? 'Cancel A' : compareB === s.id ? 'Cancel B' : !compareA ? 'Pick as A' : 'Pick as B and compare'"
                    @click.stop="toggleCompare(s.id)"
                  >
                    <UIcon name="i-lucide-git-compare" style="width:11px;height:11px;" />
                    {{ compareA === s.id ? 'A' : compareB === s.id ? 'B' : 'CMP' }}
                  </button>
                  <button
                    class="log-del"
                    :class="confirmDeleteId === s.id ? 'log-del--confirm' : ''"
                    @click.stop="confirmDeleteId === s.id ? (deleteSavedSession(s.id), confirmDeleteId = null) : (confirmDeleteId = s.id)"
                  >
                    {{ confirmDeleteId === s.id ? '✓ DELETE?' : '✕' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page layout ──────────────────────────────────────── */
.coach-layout {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: calc(100vh - 6.5rem);
}

/* ── Top bar ──────────────────────────────────────────── */
.coach-topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-shrink: 0;
}
.coach-title-group { display: flex; align-items: baseline; gap: 0.6rem; }
.coach-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--c-text);
  line-height: 1;
}
.coach-model {
  font-size: 0.68rem;
  color: var(--c-text-mid);
}
.coach-model-id {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  opacity: 0.5;
  margin-left: 0.3rem;
}
.coach-garage-warn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.6rem;
  padding: 0.18rem 0.55rem;
  background: rgba(255, 178, 0, 0.06);
  border: 1px solid rgba(255, 178, 0, 0.3);
  border-radius: 3px;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-amber);
}
.coach-garage-link {
  color: inherit;
  text-decoration: none;
}
.coach-garage-link:hover { text-decoration: underline; }
.coach-providers {
  display: flex;
  gap: 0.3rem;
  margin-left: auto;
}
.coach-clear-btn {
  padding: 0.22rem 0.6rem;
  border-radius: 5px;
  border: 1px solid rgba(255, 23, 68, 0.2);
  background: transparent;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-text-dim);
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.coach-clear-btn:hover { border-color: var(--c-red); color: var(--c-red); }

/* ── Body ─────────────────────────────────────────────── */
.coach-body {
  display: flex;
  gap: 0.6rem;
  flex: 1;
  min-height: 0;
}

/* ── Chat panel ───────────────────────────────────────── */
.coach-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
  padding: 1.5rem 1rem;
}
.chat-empty-icon { width: 26px; height: 26px; color: var(--c-drift); }
.chat-empty-title {
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-drift);
}
.chat-empty-body { font-size: 0.72rem; color: var(--c-text-mid); line-height: 1.6; }

.chat-quick-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: center;
  margin-top: 0.35rem;
}
.chat-quick-btn {
  padding: 0.22rem 0.6rem;
  border-radius: 20px;
  border: 1px solid var(--c-border-mid);
  background: transparent;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--c-text-mid);
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.12s;
}
.chat-quick-btn:hover { border-color: var(--c-drift); color: var(--c-drift); }

/* Messages */
.chat-msg {
  border-radius: 7px;
  padding: 0.32rem 0.55rem 0.4rem;
}
.chat-msg--user {
  background: rgba(255, 85, 0, 0.05);
  border: 1px solid rgba(255, 85, 0, 0.12);
  border-radius: 8px 8px 3px 8px;
}
.chat-msg--ai {
  background: rgba(0, 204, 255, 0.03);
  border: 1px solid rgba(0, 204, 255, 0.1);
  border-radius: 8px 8px 8px 3px;
}
.chat-msg-role {
  font-family: var(--font-display);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 0.14rem;
  display: flex;
  align-items: center;
}
.role-user { color: var(--c-text-dim); }
.role-ai   { color: var(--c-drift); }

.role-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.6rem;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.05em;
  color: var(--c-text-mid);
  text-transform: lowercase;
  font-weight: 400;
}
.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--c-drift);
}
.status-dot--pulse { animation: dotpulse 0.9s ease-in-out infinite; }
.status-dot--writing { background: var(--c-green); }
@keyframes dotpulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* Context preview */
.ctx-preview {
  margin: 0.2rem 0 0.35rem;
  padding: 0.32rem 0.5rem 0.36rem;
  background: rgba(0, 204, 255, 0.04);
  border: 1px solid rgba(0, 204, 255, 0.18);
  border-radius: 4px;
}
.ctx-preview-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--c-data);
  margin-bottom: 0.3rem;
}
.ctx-preview-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.ctx-preview-list li {
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--c-text-mid);
  padding-left: 0.8rem;
  position: relative;
}
.ctx-preview-list li::before {
  content: '›';
  position: absolute;
  left: 0;
  color: var(--c-data);
  opacity: 0.7;
}

/* Thinking box */
.think-box {
  margin: 0.2rem 0 0.35rem;
  border: 1px solid rgba(255, 85, 0, 0.18);
  background: rgba(255, 85, 0, 0.03);
  border-radius: 4px;
  overflow: hidden;
}
.think-toggle {
  width: 100%;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.32rem 0.55rem;
  color: var(--c-drift);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: background 0.15s;
}
.think-toggle:hover { background: rgba(255, 85, 0, 0.06); }
.think-toggle--open { background: rgba(255, 85, 0, 0.06); }
.think-toggle-label { flex-shrink: 0; }
.think-pulse {
  display: inline-block;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--c-drift);
  animation: dotpulse 0.9s ease-in-out infinite;
}
.think-body {
  padding: 0.4rem 0.6rem 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  line-height: 1.5;
  color: var(--c-text-mid);
  white-space: pre-wrap;
  border-top: 1px dashed rgba(255, 85, 0, 0.18);
  max-height: 260px;
  overflow-y: auto;
}

/* Mode toggle bar */
.mode-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: transparent;
  border: 1px solid rgba(255, 85, 0, 0.2);
  color: var(--c-text-mid);
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 0.34rem 0.7rem;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  text-transform: uppercase;
}
.mode-btn:hover {
  color: var(--c-text);
  border-color: rgba(255, 85, 0, 0.42);
}
.mode-btn--active {
  background: rgba(255, 85, 0, 0.1);
  border-color: var(--c-drift);
  color: var(--c-drift);
  box-shadow: 0 0 0 1px rgba(255, 85, 0, 0.2);
}
.mode-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--c-text-mid);
  font-style: italic;
}

.chat-msg-text {
  font-size: 0.8rem;
  line-height: 1.48;
  color: var(--c-text);
}

.chat-error {
  font-size: 0.76rem;
  color: var(--c-red);
  padding: 0.4rem 0.65rem;
  border: 1px solid rgba(255, 23, 68, 0.22);
  border-radius: 6px;
  background: rgba(255, 23, 68, 0.05);
}
.chat-error--persistent {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.3rem 0.55rem;
  flex-shrink: 0;
}

/* Input bar */
.chat-input-bar {
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}
.chat-input-form {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}

.chat-textarea {
  flex: 1;
  resize: none;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 85, 0, 0.18);
  border-radius: 7px;
  padding: 0.5rem 0.7rem;
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--c-text);
  line-height: 1.55;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  min-height: 2.8rem;
  max-height: 8rem;
  overflow-y: auto;
}
.chat-textarea::placeholder {
  color: var(--c-text-mid);
  opacity: 0.45;
  font-style: italic;
}
.chat-textarea:focus {
  border-color: rgba(255, 85, 0, 0.45);
  box-shadow: 0 0 0 2px rgba(255, 85, 0, 0.07), 0 0 14px -4px rgba(255, 85, 0, 0.2);
}
.chat-textarea:disabled { opacity: 0.4; cursor: not-allowed; }

.chat-send-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.48rem 0.9rem;
  background: rgba(255, 85, 0, 0.1);
  border: 1px solid rgba(255, 85, 0, 0.35);
  border-radius: 7px;
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--c-drift);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.13s;
  align-self: flex-end;
  min-height: 2.8rem;
}
.chat-send-btn:hover:not(:disabled) {
  background: rgba(255, 85, 0, 0.18);
  border-color: var(--c-drift);
  box-shadow: 0 0 14px -4px var(--c-drift-glow);
}
.chat-send-btn:disabled { opacity: 0.28; cursor: not-allowed; }

.chat-stop-btn {
  background: rgba(255, 23, 68, 0.12);
  border-color: rgba(255, 23, 68, 0.5);
  color: var(--c-red);
}
.chat-stop-btn:hover {
  background: rgba(255, 23, 68, 0.22);
  border-color: var(--c-red);
  box-shadow: 0 0 14px -4px rgba(255, 23, 68, 0.6);
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Sidebar ──────────────────────────────────────────── */
.coach-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
}
.sidebar-card { flex-shrink: 0; }

.sidebar-body {
  padding: 1.1rem 0.65rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

/* Session */
.rec-wide { width: 100%; justify-content: center; }
.rec-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-red); display: inline-block; }
.rec-timer { font-family: var(--font-mono); font-size: 0.72rem; color: var(--c-red); margin-bottom: 0.4rem; }
.rec-timer--paused { color: var(--c-amber); }

.session-score { text-align: center; margin-bottom: 0.45rem; }
.session-score-val {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--c-drift);
  line-height: 1.1;
}

.session-stats { display: flex; flex-direction: column; gap: 0.18rem; margin-bottom: 0.45rem; }
.sstat {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--c-text-mid);
}

.session-actions { display: flex; gap: 0.3rem; }

.rec-btn--save {
  color: var(--c-green);
  border-color: rgba(0, 255, 136, 0.4);
}
.rec-btn--save:hover { background: rgba(0, 255, 136, 0.08); }
.rec-btn--save:disabled { opacity: 0.5; cursor: not-allowed; }

.save-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(255, 85, 0, 0.18);
}
.save-input {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 85, 0, 0.18);
  color: var(--c-text);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  padding: 0.35rem 0.5rem;
  border-radius: 3px;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
}
.save-input::placeholder {
  color: var(--c-text-dim);
  font-style: italic;
}
.save-input:focus {
  border-color: var(--c-drift);
  box-shadow: 0 0 0 2px rgba(255, 85, 0, 0.1);
}
.save-flash {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--c-green);
  text-align: center;
  padding: 0.2rem 0;
}
.save-warn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  background: rgba(255, 179, 0, 0.06);
  border: 1px solid rgba(255, 179, 0, 0.22);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-amber);
  line-height: 1.3;
}

/* Coach Memory card */
.mem-card { flex-shrink: 0; }
.mem-body { padding: 0.85rem 0.55rem 0.55rem; gap: 0.4rem; }
.mem-input-row { display: flex; flex-direction: column; gap: 0.35rem; }
.mem-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 85, 0, 0.18);
  color: var(--c-text);
  font-family: var(--font-mono);
  font-size: 0.66rem;
  line-height: 1.4;
  padding: 0.38rem 0.5rem;
  border-radius: 3px;
  outline: none;
  resize: vertical;
  transition: border-color 0.15s;
}
.mem-input::placeholder { color: var(--c-text-dim); font-style: italic; }
.mem-input:focus {
  border-color: var(--c-drift);
  box-shadow: 0 0 0 2px rgba(255, 85, 0, 0.08);
}
.mem-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  background: transparent;
  border: 1px solid var(--c-drift);
  color: var(--c-drift);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 0.34rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s;
}
.mem-add-btn:hover:not(:disabled) { background: rgba(255, 85, 0, 0.1); }
.mem-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mem-empty {
  font-size: 0.62rem;
  color: var(--c-text-dim);
  line-height: 1.5;
  font-style: italic;
  padding: 0.2rem 0.1rem;
}
.mem-list { display: flex; flex-direction: column; gap: 0.3rem; }
.mem-item {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 85, 0, 0.12);
  border-radius: 3px;
  padding: 0.35rem 0.45rem 0.3rem;
}
.mem-item-text {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  line-height: 1.4;
  color: var(--c-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.mem-item-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.18rem;
}
.mem-item-meta {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--c-text-dim);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.mem-item-del {
  background: transparent;
  border: 1px solid rgba(255, 60, 60, 0.22);
  color: var(--c-red);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  padding: 1px 6px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}
.mem-item-del:hover { background: rgba(255, 60, 60, 0.1); }
.mem-item-del--confirm { background: var(--c-red); color: #fff; border-color: var(--c-red); }
.mem-more {
  font-size: 0.6rem;
  color: var(--c-text-dim);
  text-align: center;
  font-style: italic;
  padding: 0.1rem;
}

/* Saved Session Log */
.session-log-card { flex-shrink: 0; display: flex; flex-direction: column; }
.session-log-body {
  max-height: 46vh;
  overflow-y: auto;
  padding: 1.1rem 0.55rem 0.6rem;
}
.log-empty {
  font-size: 0.66rem;
  color: var(--c-text-dim);
  line-height: 1.5;
  padding: 0.3rem 0.2rem;
  font-style: italic;
}
.kbd {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  background: rgba(0, 255, 136, 0.12);
  color: var(--c-green);
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid rgba(0, 255, 136, 0.3);
  font-style: normal;
}
.log-list { display: flex; flex-direction: column; gap: 0.4rem; }
.log-item {
  position: relative;
  border: 1px solid rgba(255, 85, 0, 0.14);
  background: rgba(0, 0, 0, 0.25);
  border-radius: 3px;
  padding: 0.45rem 0.55rem 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}
.log-item:hover {
  border-color: rgba(255, 85, 0, 0.32);
  background: rgba(255, 85, 0, 0.04);
}
.log-item--active {
  border-color: var(--c-drift);
  background: rgba(255, 85, 0, 0.07);
  box-shadow: 0 0 0 1px rgba(255, 85, 0, 0.25);
}
.log-item-row1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.2rem;
}
.log-feel {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid currentColor;
}
.log-feel[data-feel="good"]   { color: var(--c-green); background: rgba(0,255,136,0.08); }
.log-feel[data-feel="medium"] { color: var(--c-amber); background: rgba(255,178,0,0.08); }
.log-feel[data-feel="bad"]    { color: var(--c-red);   background: rgba(255,60,60,0.08); }
.log-item-name {
  font-family: var(--font-display);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--c-text);
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.log-item-score {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--c-drift);
}
.log-item-row2 {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-text-mid);
  line-height: 1.5;
}
.log-item-car { color: var(--c-data); }
.log-item-sep { color: var(--c-text-dim); }
.log-item-row3 { display: flex; justify-content: flex-end; margin-top: 0.3rem; }
/* Selected-session detail block: mini-map + top chains */
.log-detail {
  margin-top: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px dashed rgba(255, 85, 0, 0.16);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.log-detail-map {
  width: 100%;
  max-width: 170px;
  align-self: center;
}
.log-detail-title {
  font-family: var(--font-display);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  color: var(--c-text-mid);
  margin-bottom: 0.18rem;
}
.log-detail-chains {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.log-chain {
  display: grid;
  grid-template-columns: 18px 38px 1fr auto;
  align-items: baseline;
  gap: 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
}
.log-chain-rank { color: var(--c-drift); font-weight: 700; }
.log-chain-dur { color: var(--c-green); }
.log-chain-stats { color: var(--c-text-mid); }
.log-chain-score {
  color: var(--c-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* Row 3 holds the action buttons — flex with auto-spaced gap */
.log-item-row3 {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  margin-top: 0.32rem;
}
.log-promote {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--c-text-mid);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}
.log-promote:hover {
  border-color: var(--c-green);
  color: var(--c-green);
  background: rgba(0, 255, 136, 0.06);
}
.log-promote--hot {
  border-color: rgba(0, 255, 136, 0.45);
  color: var(--c-green);
  background: rgba(0, 255, 136, 0.06);
}
.log-promote--hot:hover { background: rgba(0, 255, 136, 0.14); }
.log-promote:disabled { opacity: 0.5; cursor: not-allowed; }
.log-promoted {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.55rem;
  color: var(--c-green);
  letter-spacing: 0.06em;
}

/* Session compare button */
.log-compare {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  background: transparent;
  border: 1px solid rgba(255, 85, 0, 0.3);
  color: var(--c-drift);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
}
.log-compare:hover { background: rgba(255,85,0,0.08); }
.log-compare--a {
  background: rgba(0, 204, 255, 0.18);
  border-color: var(--c-data);
  color: var(--c-data);
  font-weight: 700;
}
.log-compare--b {
  background: rgba(255, 85, 0, 0.18);
  border-color: var(--c-drift);
  font-weight: 700;
}

/* Session compare inline panel */
.cmp-panel {
  margin-bottom: 0.45rem;
  padding: 0.4rem 0.45rem 0.5rem;
  background: rgba(255, 85, 0, 0.04);
  border: 1px solid rgba(255, 85, 0, 0.22);
  border-radius: 4px;
}
.cmp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cmp-title {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--c-drift);
}
.cmp-close {
  background: transparent;
  border: none;
  color: var(--c-text-mid);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  cursor: pointer;
  padding: 1px 4px;
}
.cmp-close:hover { color: var(--c-red); }
.cmp-names {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0.3rem 0;
}
.cmp-name {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmp-name--a { color: var(--c-data); }
.cmp-name--b { color: var(--c-drift); }
.cmp-maps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.3rem;
  margin-bottom: 0.4rem;
}
.cmp-map { display: block; }
.cmp-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
  overflow: hidden;
}
.cmp-row {
  display: grid;
  grid-template-columns: 1.4fr 0.7fr 0.7fr 0.6fr;
  gap: 0.3rem;
  padding: 0.18rem 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  background: rgba(0, 0, 0, 0.4);
  align-items: baseline;
}
.cmp-row-lbl { color: var(--c-text-mid); }
.cmp-row-a   { color: var(--c-data); text-align: right; font-variant-numeric: tabular-nums; }
.cmp-row-b   { color: var(--c-text); text-align: right; font-variant-numeric: tabular-nums; }
.cmp-row--better { font-weight: 700; color: var(--c-green); }
.cmp-row-d   { text-align: right; color: var(--c-text-dim); font-variant-numeric: tabular-nums; }
.cmp-row-d--better { color: var(--c-green); font-weight: 700; }
.cmp-row-d--worse  { color: var(--c-red); }

.cmp-fade-enter-active, .cmp-fade-leave-active { transition: opacity 0.18s, transform 0.18s; }
.cmp-fade-enter-from, .cmp-fade-leave-to { opacity: 0; transform: translateY(-4px); }
.log-del {
  background: transparent;
  border: 1px solid rgba(255, 60, 60, 0.3);
  color: var(--c-red);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  padding: 2px 8px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.05em;
}
.log-del:hover { background: rgba(255, 60, 60, 0.12); }
.log-del--confirm {
  background: var(--c-red);
  color: #fff;
  border-color: var(--c-red);
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Context */
.ctx-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.ctx-info { flex: 1; min-width: 0; }
.ctx-name {
  font-family: var(--font-display);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-text);
}
.ctx-detail { font-size: 0.6rem; margin-top: 0.05rem; }

/* shared label */
.t-lbl {
  font-family: var(--font-display);
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-text-mid);
  margin-bottom: 0.2rem;
}

/* ── Markdown in AI messages ──────────────────────────── */
.md-body :deep(.md-h1) {
  display: block;
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--c-drift);
  margin: 0.4rem 0 0.1rem;
}
.md-body :deep(.md-h2) {
  display: block;
  font-family: var(--font-display);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--c-data);
  margin: 0.32rem 0 0.08rem;
  text-transform: uppercase;
}
.md-body :deep(.md-h3) {
  display: block;
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-text);
  margin: 0.24rem 0 0.06rem;
}
.md-body :deep(.md-h1:first-child),
.md-body :deep(.md-h2:first-child),
.md-body :deep(.md-h3:first-child) { margin-top: 0; }
.md-body :deep(.md-hr) {
  border: none;
  border-top: 1px dashed rgba(255, 85, 0, 0.18);
  margin: 0.45rem 0;
}
.md-body :deep(.md-bold) {
  color: var(--c-text);
  font-weight: 600;
}
.md-body :deep(.md-code) {
  font-family: var(--font-mono);
  font-size: 0.8em;
  background: rgba(255, 255, 255, 0.07);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}
.md-body :deep(.md-num) {
  display: flex;
  gap: 0.4rem;
  padding: 0.04rem 0;
  line-height: 1.42;
}
.md-body :deep(.md-num-idx) {
  color: var(--c-drift);
  font-family: var(--font-mono);
  font-size: 0.78em;
  flex-shrink: 0;
  min-width: 1.3rem;
}
.md-body :deep(.md-bul) {
  display: flex;
  gap: 0.4rem;
  padding: 0.04rem 0;
  line-height: 1.42;
}
.md-body :deep(.md-bul-dot) {
  color: var(--c-data);
  flex-shrink: 0;
}

/* Accept-tune action card */
.accept-card {
  margin-top: 0.55rem;
  padding: 0.45rem 0.6rem 0.5rem;
  background: linear-gradient(90deg, rgba(0, 255, 136, 0.07), rgba(255, 85, 0, 0.05));
  border: 1px solid rgba(0, 255, 136, 0.32);
  border-radius: 5px;
}
.accept-card-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.accept-card-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}
.accept-card-title {
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-green);
  text-transform: uppercase;
}
.accept-card-sub {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  color: var(--c-text-mid);
  margin-top: 0.08rem;
  line-height: 1.4;
}
.accept-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(0, 255, 136, 0.14);
  border: 1px solid var(--c-green);
  color: var(--c-green);
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.42rem 0.7rem;
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}
.accept-btn:hover { background: rgba(0, 255, 136, 0.22); box-shadow: 0 0 0 1px rgba(0, 255, 136, 0.35); }
.accept-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.accept-done {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-mono);
  font-size: 0.66rem;
  color: var(--c-green);
  white-space: nowrap;
}

/* Markdown tables — comparison grid */
.md-body :deep(.md-table) {
  display: grid;
  gap: 1px;
  margin: 0.4rem 0;
  background: rgba(255, 85, 0, 0.16);
  border: 1px solid rgba(255, 85, 0, 0.22);
  border-radius: 4px;
  overflow: hidden;
  font-family: var(--font-mono);
}
.md-body :deep(.md-tr) {
  display: contents;
}
.md-body :deep(.md-th),
.md-body :deep(.md-td) {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.3rem 0.5rem;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--c-text);
  white-space: normal;
  word-break: break-word;
}
.md-body :deep(.md-th) {
  background: rgba(255, 85, 0, 0.12);
  color: var(--c-drift);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.md-body :deep(.md-td .md-bold) {
  color: var(--c-data);
}
</style>
