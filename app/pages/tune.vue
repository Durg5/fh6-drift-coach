<script setup lang="ts">
useHead({ title: 'Drift Coach — Tune Setup' })
const { tune } = useTune()
const { revisions, saving, saveFlash, saveRevision, deleteRevision, loadRevision } = useTuneRevisions()
const {
  refs: refTunes, saving: refSaving, flash: refFlash,
  saveCurrentAsReference, remove: removeRefTune,
} = useReferenceTunes()

const refLabelInput = ref('')
const refNotesInput = ref('')
const showRefForm = ref(false)
const refConfirmDelete = ref<string | null>(null)

async function saveAsRef() {
  if (!refLabelInput.value.trim()) return
  await saveCurrentAsReference(refLabelInput.value, refNotesInput.value || undefined)
  refLabelInput.value = ''
  refNotesInput.value = ''
  showRefForm.value = false
}

const GEARS = [
  { key: 'gear1'  as const, n: '1' },
  { key: 'gear2'  as const, n: '2' },
  { key: 'gear3'  as const, n: '3' },
  { key: 'gear4'  as const, n: '4' },
  { key: 'gear5'  as const, n: '5' },
  { key: 'gear6'  as const, n: '6' },
  { key: 'gear7'  as const, n: '7' },
  { key: 'gear8'  as const, n: '8' },
  { key: 'gear9'  as const, n: '9' },
  { key: 'gear10' as const, n: '10' },
]

const saveNameInput = ref('')
const confirmDeleteId = ref<string | null>(null)

function doSave() {
  saveRevision(saveNameInput.value.trim() || undefined)
  saveNameInput.value = ''
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA') + ' ' +
    new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ── A/B diff selection ──────────────────────────────────────
// Click "DIFF" on a revision → it becomes A (highlighted blue).
// Click another revision's "DIFF" → it becomes B and the diff panel renders.
// Click the same one again → clears that slot.
const diffA = ref<string | null>(null)
const diffB = ref<string | null>(null)

function toggleDiff(id: string) {
  if (diffA.value === id) { diffA.value = null; return }
  if (diffB.value === id) { diffB.value = null; return }
  if (!diffA.value) { diffA.value = id; return }
  diffB.value = id
}
function clearDiff() {
  diffA.value = null
  diffB.value = null
}

const revA = computed(() => revisions.value.find(r => r.id === diffA.value) ?? null)
const revB = computed(() => revisions.value.find(r => r.id === diffB.value) ?? null)
const showDiff = computed(() => Boolean(revA.value && revB.value))

// Diff rows in FH6 order
interface DiffRow {
  group: string
  param: string
  a: string | number
  b: string | number
  changed: boolean
  delta: string  // e.g. "+20", "-1.5°", "—"
}

function numDelta(a: unknown, b: unknown, unit = ''): string {
  const na = Number(a), nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    const d = nb - na
    if (Math.abs(d) < 0.001) return '—'
    const rounded = Math.abs(d) < 10 ? d.toFixed(2).replace(/\.?0+$/, '') : Math.round(d).toString()
    return (d > 0 ? '+' : '') + rounded + unit
  }
  if (String(a) === String(b)) return '—'
  return `→ ${b}`
}

const diffRows = computed<DiffRow[]>(() => {
  const A = revA.value?.tune as Record<string, unknown> | undefined
  const B = revB.value?.tune as Record<string, unknown> | undefined
  if (!A || !B) return []
  const rows: { group: string; param: string; key: string; unit?: string }[] = [
    // 1. Tires
    { group: '1. TIRES',     param: 'Pressure F',  key: 'tirePressureF', unit: ' psi' },
    { group: '1. TIRES',     param: 'Pressure R',  key: 'tirePressureR', unit: ' psi' },
    // 2. Gearing
    { group: '2. GEARING',   param: 'Final Drive', key: 'finalDrive' },
    ...['gear1','gear2','gear3','gear4','gear5','gear6','gear7','gear8','gear9','gear10']
      .map((g, i) => ({ group: '2. GEARING', param: `Gear ${i+1}`, key: g })),
    // 3. Alignment
    { group: '3. ALIGNMENT', param: 'Camber F',  key: 'camberF', unit: '°' },
    { group: '3. ALIGNMENT', param: 'Camber R',  key: 'camberR', unit: '°' },
    { group: '3. ALIGNMENT', param: 'Toe F',     key: 'toeF',    unit: '°' },
    { group: '3. ALIGNMENT', param: 'Toe R',     key: 'toeR',    unit: '°' },
    { group: '3. ALIGNMENT', param: 'Caster F',  key: 'casterF', unit: '°' },
    // 4. ARB
    { group: '4. ARB',       param: 'ARB F', key: 'arbF' },
    { group: '4. ARB',       param: 'ARB R', key: 'arbR' },
    // 5. Springs
    { group: '5. SPRINGS',   param: 'Rate F',   key: 'springRateF', unit: ' lb/in' },
    { group: '5. SPRINGS',   param: 'Rate R',   key: 'springRateR', unit: ' lb/in' },
    { group: '5. SPRINGS',   param: 'Height F', key: 'rideHeightF', unit: ' in' },
    { group: '5. SPRINGS',   param: 'Height R', key: 'rideHeightR', unit: ' in' },
    // 6. Damping
    { group: '6. DAMPING',   param: 'Rebound F', key: 'reboundF' },
    { group: '6. DAMPING',   param: 'Rebound R', key: 'reboundR' },
    { group: '6. DAMPING',   param: 'Bump F',    key: 'bumpF' },
    { group: '6. DAMPING',   param: 'Bump R',    key: 'bumpR' },
    // 7. Aero
    { group: '7. AERO',      param: 'Front lbf', key: 'aeroFront' },
    { group: '7. AERO',      param: 'Rear lbf',  key: 'aeroRear' },
    // 8. Brake
    { group: '8. BRAKE',     param: 'Balance F', key: 'brakeBiasF', unit: '%' },
    { group: '8. BRAKE',     param: 'Force',     key: 'brakeForce', unit: '%' },
    // 9. Diff
    { group: '9. DIFF',      param: 'Accel',     key: 'diffAccel', unit: '%' },
    { group: '9. DIFF',      param: 'Decel',     key: 'diffDecel', unit: '%' },
  ]
  return rows
    .filter(r => {
      // Hide gear rows where both sides are 0/empty
      if (r.key.startsWith('gear') && r.key !== 'gear1' && r.key !== 'gear2') {
        const a = Number(A[r.key]) || 0, b = Number(B[r.key]) || 0
        if (a === 0 && b === 0) return false
      }
      return true
    })
    .map(r => {
      const a = A[r.key] ?? '—'
      const b = B[r.key] ?? '—'
      const changed = String(a) !== String(b)
      const delta = changed ? numDelta(a, b, r.unit ?? '') : '—'
      return { group: r.group, param: r.param, a: a as string|number, b: b as string|number, changed, delta }
    })
})

const diffSummary = computed(() => {
  const rows = diffRows.value
  return {
    changed: rows.filter(r => r.changed).length,
    total: rows.length,
  }
})
</script>

<template>
  <NuxtErrorBoundary @error="(e) => { console.error('[tune page] runtime error:', e); }">
  <template #error="{ error, clearError }">
    <div class="tp-err">
      <div class="tp-err-title">
        <UIcon name="i-lucide-triangle-alert" style="width:16px;height:16px;color:var(--c-red);" />
        TUNE PAGE — RUNTIME ERROR
      </div>
      <pre class="tp-err-msg">{{ error?.message || error }}</pre>
      <pre v-if="error?.stack" class="tp-err-stack">{{ error.stack }}</pre>
      <button class="tp-err-btn" @click="clearError">RETRY</button>
      <div class="tp-err-help">
        If this keeps happening, try opening the app in an incognito/private window —
        a corrupted client cache (common on devices low on disk) can stop a chunk from loading
        and break the page silently.
      </div>
    </div>
  </template>
  <div class="tp">

    <!-- ── Build info bar (two rows for breathing room) ───────── -->
    <div class="tp-build">
      <!-- Row 1: car identity + build context -->
      <div class="tp-build-row">
        <div class="bf bf--make">
          <label class="t-lbl">MAKE</label>
          <input v-model="tune.carMake" type="text" class="t-text t-text--sm" placeholder="Nissan" />
        </div>
        <div class="bf bf--year">
          <label class="t-lbl">YEAR</label>
          <input v-model.number="tune.carYear" type="number" class="t-num t-num--sm" min="1900" max="2099" placeholder="1999" />
        </div>
        <div class="bf bf--model">
          <label class="t-lbl">MODEL</label>
          <input v-model="tune.carModel" type="text" class="t-text t-text--sm" placeholder="R34 GTR" />
        </div>
        <div class="bf bf--wide">
          <label class="t-lbl">BUILD NAME</label>
          <input v-model="tune.carName" type="text" class="t-text t-text--sm" placeholder="e.g. 4-Rotor 240SX (optional)" />
        </div>
        <div class="bf bf--engine">
          <label class="t-lbl">ENGINE</label>
          <input v-model="tune.engineSwap" type="text" class="t-text t-text--sm" placeholder="stock / swap" />
        </div>
        <div class="bf bf--notes">
          <label class="t-lbl">NOTES</label>
          <input v-model="tune.buildNotes" type="text" class="t-text t-text--sm" placeholder="build notes…" />
        </div>
      </div>

      <!-- Row 2: numeric specs + categorical + tire widths -->
      <div class="tp-build-row tp-build-row--specs">
        <div class="bf bf--num">
          <label class="t-lbl">POWER</label>
          <div class="build-stat-row">
            <input v-model.number="tune.powerHp" type="number" class="t-num t-num--sm" min="0" max="2000" />
            <span class="t-u">hp</span>
          </div>
        </div>
        <div class="bf bf--num">
          <label class="t-lbl">WEIGHT</label>
          <div class="build-stat-row">
            <input v-model.number="tune.weightLb" type="number" class="t-num t-num--sm" min="0" max="9999" />
            <span class="t-u">lb</span>
          </div>
        </div>
        <div class="bf bf--num">
          <label class="t-lbl">WT DIST</label>
          <div class="build-stat-row">
            <input v-model.number="tune.weightFrontPct" type="number" class="t-num t-num--sm" min="0" max="100" />
            <span class="t-u">% F</span>
          </div>
        </div>
        <div class="bf bf--num bf--narrow">
          <label class="t-lbl">PI</label>
          <input v-model.number="tune.piNumber" type="number" class="t-num t-num--sm" min="0" max="999" />
        </div>

        <div class="bf-divider" />

        <div class="bf bf--sel">
          <label class="t-lbl">DRIVETRAIN</label>
          <select v-model="tune.drivetrainType" class="t-sel">
            <option>RWD</option><option>AWD</option><option>FWD</option>
          </select>
        </div>
        <div class="bf bf--sel bf--narrow">
          <label class="t-lbl">CLASS</label>
          <select v-model="tune.piClass" class="t-sel">
            <option>D</option><option>C</option><option>B</option>
            <option>A</option><option>S1</option><option>S2</option><option>X</option>
          </select>
        </div>
        <div class="bf bf--sel">
          <label class="t-lbl">TIRES</label>
          <select v-model="tune.tireCompound" class="t-sel">
            <option>Stock</option><option>Sport</option><option>Semi-Slick</option>
            <option>Slick</option><option>Drift</option>
          </select>
        </div>
        <div class="bf bf--sel">
          <label class="t-lbl">AERO</label>
          <select v-model="tune.aeroType" class="t-sel">
            <option value="none">None</option>
            <option value="splitter">Splitter</option>
            <option value="wing">Wing</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div class="bf bf--sel bf--feel">
          <label class="t-lbl">
            FEEL
            <UIcon name="i-lucide-info" class="feel-info" />
          </label>
          <select v-model="tune.feel" class="t-sel feel-sel" :data-feel="tune.feel">
            <option value="na">— rate —</option>
            <option value="good">Good · dialed</option>
            <option value="medium">Medium · workable</option>
            <option value="bad">Bad · broken</option>
          </select>
        </div>

        <div class="bf-divider" />

        <div class="bf bf--num">
          <label class="t-lbl">TIRE W F</label>
          <div class="build-stat-row">
            <input v-model.number="tune.tireWidthF" type="number" class="t-num t-num--sm" min="100" max="400" step="5" />
            <span class="t-u">mm</span>
          </div>
        </div>
        <div class="bf bf--num">
          <label class="t-lbl">TIRE W R</label>
          <div class="build-stat-row">
            <input v-model.number="tune.tireWidthR" type="number" class="t-num t-num--sm" min="100" max="400" step="5" />
            <span class="t-u">mm</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Main layout: params + revisions ────────────────── -->
    <!-- A/B revision diff panel (inline, above the param grid when active) -->
    <Transition name="diff-fade">
      <div v-if="showDiff && revA && revB" class="diff-panel">
        <div class="diff-header">
          <div class="diff-title">
            <UIcon name="i-lucide-git-compare" style="width:13px;height:13px;color:var(--c-drift);" />
            REVISION DIFF · {{ diffSummary.changed }} of {{ diffSummary.total }} parameters changed
          </div>
          <div class="diff-ab">
            <span class="diff-tag diff-tag--a">A: {{ revA.name }}</span>
            <span class="diff-tag diff-tag--b">B: {{ revB.name }}</span>
          </div>
          <button class="diff-close" @click="clearDiff">✕ CLOSE</button>
        </div>
        <div class="diff-table">
          <div class="diff-row diff-row--head">
            <span>GROUP / PARAM</span>
            <span class="diff-val">A</span>
            <span class="diff-val">B</span>
            <span class="diff-delta">Δ</span>
          </div>
          <div
            v-for="(r, i) in diffRows"
            :key="i"
            class="diff-row"
            :class="r.changed ? 'diff-row--changed' : ''"
          >
            <span class="diff-param"><span class="diff-group">{{ r.group }}</span> · {{ r.param }}</span>
            <span class="diff-val diff-val--a">{{ r.a }}</span>
            <span class="diff-val diff-val--b">{{ r.b }}</span>
            <span class="diff-delta" :class="r.changed ? 'diff-delta--hot' : ''">{{ r.delta }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <div class="tp-main">

      <!-- Parameter grid (3 cols) -->
      <div class="tp-grid">

        <!-- ═══ COL 1 — FH6 order #1 #2 #3: Tires · Gearing · Alignment ═══ -->
        <div class="tp-col">

          <!-- 1. TIRES -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">1</span>
              <UIcon name="i-lucide-circle-dot" class="ts-ico" />Tires
            </div>
            <div class="tr">
              <span class="t-p">PRESSURE</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.tirePressureF" type="number" class="t-num" min="20" max="50" step="0.5" /><span class="t-u">PSI</span></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.tirePressureR" type="number" class="t-num" min="20" max="50" step="0.5" /><span class="t-u">PSI</span></div>
              </div>
            </div>
          </div>

          <!-- 2. GEARING -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">2</span>
              <UIcon name="i-lucide-settings-2" class="ts-ico" />Gearing
            </div>
            <div class="tr">
              <span class="t-p">FINAL DRIVE</span>
              <div class="t-pair">
                <div class="t-fld"><input v-model.number="tune.finalDrive" type="number" class="t-num" min="1" max="6.99" step="0.01" /><span class="t-u">ratio</span></div>
              </div>
            </div>
            <div class="gear-grid">
              <div v-for="g in GEARS" :key="g.key" class="gear-cell">
                <span class="gear-lbl">{{ g.n }}</span>
                <input v-model.number="tune[g.key]" type="number" class="t-num gear-num" min="0" max="9.99" step="0.01" />
              </div>
            </div>
          </div>

          <!-- 3. ALIGNMENT -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">3</span>
              <UIcon name="i-lucide-sliders-horizontal" class="ts-ico" />Alignment
            </div>
            <div class="tr">
              <span class="t-p">CAMBER</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.camberF" type="number" class="t-num" min="-5" max="5" step="0.1" /><span class="t-u">°</span></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.camberR" type="number" class="t-num" min="-5" max="5" step="0.1" /><span class="t-u">°</span></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">TOE</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.toeF" type="number" class="t-num" min="-3" max="3" step="0.1" /><span class="t-u">°</span></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.toeR" type="number" class="t-num" min="-3" max="3" step="0.1" /><span class="t-u">°</span></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">CASTER</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.casterF" type="number" class="t-num" min="0" max="7" step="0.1" /><span class="t-u">°</span></div>
              </div>
            </div>
          </div>

        </div>

        <!-- ═══ COL 2 — FH6 order #4 #5 #6: ARB · Springs · Damping ═══ -->
        <div class="tp-col">

          <!-- 4. ARB -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">4</span>
              <UIcon name="i-lucide-minus" class="ts-ico" />Anti-Roll Bars<span class="ts-range">1 – 65</span>
            </div>
            <div class="tr">
              <span class="t-p">STIFFNESS</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.arbF" type="number" class="t-num" min="1" max="65" /></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.arbR" type="number" class="t-num" min="1" max="65" /></div>
              </div>
            </div>
          </div>

          <!-- 5. SPRINGS -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">5</span>
              <UIcon name="i-lucide-waves" class="ts-ico" />Springs
            </div>
            <div class="tr">
              <span class="t-p">SPRING RATE</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.springRateF" type="number" class="t-num" min="100" max="2000" step="10" /><span class="t-u">lb/in</span></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.springRateR" type="number" class="t-num" min="100" max="2000" step="10" /><span class="t-u">lb/in</span></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">RIDE HEIGHT</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.rideHeightF" type="number" class="t-num" min="3" max="12" step="0.1" /><span class="t-u">in</span></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.rideHeightR" type="number" class="t-num" min="3" max="12" step="0.1" /><span class="t-u">in</span></div>
              </div>
            </div>
          </div>

          <!-- 6. DAMPING -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">6</span>
              <UIcon name="i-lucide-activity" class="ts-ico" />Damping<span class="ts-range">1 – 20</span>
            </div>
            <div class="tr">
              <span class="t-p">REBOUND</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.reboundF" type="number" class="t-num" min="1" max="20" /></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.reboundR" type="number" class="t-num" min="1" max="20" /></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">BUMP</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.bumpF" type="number" class="t-num" min="1" max="20" /></div>
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.bumpR" type="number" class="t-num" min="1" max="20" /></div>
              </div>
            </div>
          </div>

        </div>

        <!-- ═══ COL 3 — FH6 order #7 #8 #9: Aero(conditional) · Brake · Differential ═══ -->
        <div class="tp-col">

          <!-- 7. AERO — only show applicable axles -->
          <div v-if="tune.aeroType !== 'none'" class="ts">
            <div class="ts-hd">
              <span class="ts-num">7</span>
              <UIcon name="i-lucide-wind" class="ts-ico" />Aero<span class="ts-range">{{ tune.aeroType === 'both' ? 'splitter + wing' : tune.aeroType }}</span>
            </div>
            <div v-if="tune.aeroType === 'splitter' || tune.aeroType === 'both'" class="tr">
              <span class="t-p">SPLITTER (F)</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax f">F</span><input v-model.number="tune.aeroFront" type="number" class="t-num" min="0" max="999" step="5" /><span class="t-u">lbf</span></div>
              </div>
            </div>
            <div v-if="tune.aeroType === 'wing' || tune.aeroType === 'both'" class="tr">
              <span class="t-p">WING (R)</span>
              <div class="t-pair">
                <div class="t-fld"><span class="t-ax r">R</span><input v-model.number="tune.aeroRear" type="number" class="t-num" min="0" max="999" step="5" /><span class="t-u">lbf</span></div>
              </div>
            </div>
          </div>

          <!-- 8. BRAKE -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">8</span>
              <UIcon name="i-lucide-octagon" class="ts-ico" />Brake
            </div>
            <div class="tr">
              <span class="t-p">BALANCE (F)</span>
              <div class="t-pair">
                <div class="t-fld"><input v-model.number="tune.brakeBiasF" type="number" class="t-num" min="0" max="100" /><span class="t-u">%</span></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">FORCE</span>
              <div class="t-pair">
                <div class="t-fld"><input v-model.number="tune.brakeForce" type="number" class="t-num" min="0" max="150" /><span class="t-u">%</span></div>
              </div>
            </div>
          </div>

          <!-- 9. DIFFERENTIAL — rear only (drift never AWD) -->
          <div class="ts">
            <div class="ts-hd">
              <span class="ts-num">9</span>
              <UIcon name="i-lucide-git-fork" class="ts-ico" />Differential<span class="ts-range">rear · 0 – 100%</span>
            </div>
            <div class="tr">
              <span class="t-p">ACCELERATION</span>
              <div class="t-pair">
                <div class="t-fld"><input v-model.number="tune.diffAccel" type="number" class="t-num" min="0" max="100" /><span class="t-u">%</span></div>
              </div>
            </div>
            <div class="tr">
              <span class="t-p">DECELERATION</span>
              <div class="t-pair">
                <div class="t-fld"><input v-model.number="tune.diffDecel" type="number" class="t-num" min="0" max="100" /><span class="t-u">%</span></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ═══ REVISIONS PANEL ═══ -->
      <div class="rev-panel">
        <div class="rev-header">
          <div class="rev-title">
            <UIcon name="i-lucide-history" style="width:12px;height:12px;" />
            REVISIONS
          </div>
          <span class="rev-count">{{ revisions.length }}</span>
        </div>

        <!-- Save row -->
        <div class="rev-save-row">
          <input
            v-model="saveNameInput"
            type="text"
            class="t-text rev-name-inp"
            placeholder="Rev name (optional)"
            @keydown.enter="doSave"
          />
          <button class="rev-save-btn" :disabled="saving" @click="doSave">
            <UIcon v-if="saving" name="i-lucide-loader-circle" style="width:11px;height:11px;animation:spin 0.7s linear infinite;" />
            <UIcon v-else name="i-lucide-bookmark-plus" style="width:11px;height:11px;" />
            SAVE
          </button>
        </div>
        <Transition name="flash">
          <div v-if="saveFlash" class="rev-flash">
            <UIcon name="i-lucide-check" style="width:10px;height:10px;" /> Saved
          </div>
        </Transition>

        <!-- Reference library — known-good baseline tunes the coach uses as RAG context -->
        <div class="ref-section">
          <div class="ref-header">
            <div class="ref-title">
              <UIcon name="i-lucide-bookmark-check" style="width:11px;height:11px;" />
              REFERENCE LIBRARY
            </div>
            <span class="ref-count">{{ refTunes.length }}</span>
          </div>
          <div class="ref-help">
            Mark a dialed tune as a baseline — every coach response will see it as ground-truth for what works.
          </div>
          <button
            v-if="!showRefForm"
            class="ref-mark-btn"
            :disabled="!tune.feel || tune.feel === 'na'"
            :title="tune.feel === 'good' ? 'Save this tune as a baseline reference' : 'Set FEEL to GOOD first (or MEDIUM/BAD if intentionally marking a non-baseline)'"
            @click="showRefForm = true; refLabelInput = `${tune.carName || tune.carModel || 'tune'} baseline`"
          >
            <UIcon name="i-lucide-star" style="width:11px;height:11px;" />
            MARK AS REFERENCE
          </button>
          <div v-else class="ref-form">
            <input
              v-model="refLabelInput"
              type="text"
              class="t-text rev-name-inp"
              placeholder="Label (e.g. R34 GTR sweet spot)"
            />
            <textarea
              v-model="refNotesInput"
              class="t-text rev-name-inp ref-notes"
              placeholder="What makes this tune work? (entry behavior, optimal speed, surface…)"
              rows="2"
            />
            <div class="ref-form-row">
              <button class="ref-cancel" @click="showRefForm = false">CANCEL</button>
              <button
                class="rev-save-btn ref-save"
                :disabled="!refLabelInput.trim() || refSaving"
                @click="saveAsRef"
              >
                <UIcon
                  :name="refSaving ? 'i-lucide-loader-circle' : 'i-lucide-bookmark-plus'"
                  :style="refSaving ? 'width:11px;height:11px;animation:spin 0.7s linear infinite;' : 'width:11px;height:11px;'"
                />
                SAVE
              </button>
            </div>
          </div>
          <Transition name="flash">
            <div v-if="refFlash" class="rev-flash">
              <UIcon name="i-lucide-check" style="width:10px;height:10px;" /> Saved
            </div>
          </Transition>

          <div v-if="refTunes.length" class="ref-list">
            <div v-for="r in refTunes" :key="r.id" class="ref-item">
              <div class="ref-item-top">
                <div class="ref-item-label">{{ r.label }}</div>
                <button
                  class="ref-del"
                  :class="refConfirmDelete === r.id ? 'ref-del--confirm' : ''"
                  @click="refConfirmDelete === r.id ? (removeRefTune(r.id), refConfirmDelete = null) : (refConfirmDelete = r.id)"
                >{{ refConfirmDelete === r.id ? '✓ delete?' : '✕' }}</button>
              </div>
              <div class="ref-item-car">
                {{ [r.carYear, r.carMake, r.carModel].filter(Boolean).join(' ') || r.carName }}
                · {{ r.drivetrainType }} {{ r.piClass }}{{ r.piNumber ? ' ' + r.piNumber : '' }}
              </div>
              <div v-if="r.notes" class="ref-item-notes">{{ r.notes }}</div>
            </div>
          </div>
        </div>

        <div class="rev-divider" />

        <!-- Revision list -->
        <div class="rev-list">
          <div v-if="!revisions.length" class="rev-empty">
            No revisions yet — save your first tune to start tracking changes
          </div>
          <div
            v-for="(rev, i) in [...revisions].reverse()"
            :key="rev.id"
            class="rev-item"
          >
            <div class="rev-item-top">
              <div class="rev-num">Rev {{ revisions.length - i }}</div>
              <div class="rev-date">{{ fmtDate(rev.createdAt) }}</div>
            </div>
            <div class="rev-name">{{ rev.name }}</div>
            <div class="rev-car">{{ rev.tune.carName || '—' }} · {{ rev.tune.piClass }}{{ rev.tune.piNumber ? ' ' + rev.tune.piNumber : '' }}</div>
            <div class="rev-params">
              Spr {{ rev.tune.springRateF }}/{{ rev.tune.springRateR }}
              · Rbd {{ rev.tune.reboundF }}/{{ rev.tune.reboundR }}
              · ARB {{ rev.tune.arbF }}/{{ rev.tune.arbR }}
              · Diff {{ rev.tune.diffAccel }}/{{ rev.tune.diffDecel }}
            </div>
            <div class="rev-actions">
              <button class="rev-act-btn rev-act-btn--load" @click="loadRevision(rev)">
                <UIcon name="i-lucide-download" style="width:10px;height:10px;" /> Load
              </button>
              <!-- Diff selection: first click → A, second click on different rev → B -->
              <button
                class="rev-act-btn rev-act-btn--diff"
                :class="{
                  'rev-act-btn--diff-a': diffA === rev.id,
                  'rev-act-btn--diff-b': diffB === rev.id,
                }"
                :title="diffA === rev.id ? 'Cancel A' : diffB === rev.id ? 'Cancel B' : !diffA ? 'Set as A (then click another DIFF)' : 'Set as B and compare'"
                @click="toggleDiff(rev.id)"
              >
                <UIcon name="i-lucide-git-compare" style="width:10px;height:10px;" />
                {{ diffA === rev.id ? 'A' : diffB === rev.id ? 'B' : 'DIFF' }}
              </button>
              <button
                v-if="confirmDeleteId === rev.id"
                class="rev-act-btn rev-act-btn--confirm"
                @click="deleteRevision(rev.id); confirmDeleteId = null"
              >Confirm delete</button>
              <button
                v-else
                class="rev-act-btn rev-act-btn--del"
                @click="confirmDeleteId = rev.id"
              >
                <UIcon name="i-lucide-trash-2" style="width:10px;height:10px;" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
  </NuxtErrorBoundary>
</template>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Page ─────────────────────────────────────────────── */
.tp { display: flex; flex-direction: column; gap: 0.65rem; }

/* ── Runtime-error fallback ───────────────────────────── */
.tp-err {
  max-width: 720px;
  margin: 2rem auto;
  padding: 1.4rem 1.6rem;
  background: rgba(255, 23, 68, 0.04);
  border: 1px solid rgba(255, 23, 68, 0.32);
  border-radius: 8px;
}
.tp-err-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-red);
  margin-bottom: 0.8rem;
}
.tp-err-msg, .tp-err-stack {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,23,68,0.18);
  border-radius: 4px;
  padding: 0.6rem 0.7rem;
  color: var(--c-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.6rem;
  max-height: 320px;
  overflow-y: auto;
}
.tp-err-stack { color: var(--c-text-mid); font-size: 0.66rem; }
.tp-err-btn {
  background: rgba(255, 85, 0, 0.12);
  border: 1px solid var(--c-drift);
  color: var(--c-drift);
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
}
.tp-err-btn:hover { background: rgba(255, 85, 0, 0.22); }
.tp-err-help {
  margin-top: 0.8rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--c-text-mid);
  line-height: 1.55;
}

/* ── Build info bar ───────────────────────────────────── */
.tp-build {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem 0.85rem 0.7rem;
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-up) 100%);
  border: 1px solid var(--c-border-mid);
  border-radius: 10px;
  position: relative;
  overflow: hidden;
}
.tp-build::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, var(--c-drift) 0%, transparent 60%);
}

/* Each row — fluid flex with sensible wrap if narrow */
.tp-build-row {
  display: flex;
  gap: 0.55rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.tp-build-row--specs {
  border-top: 1px dashed rgba(255, 85, 0, 0.12);
  padding-top: 0.55rem;
}

/* Build field — vertical stack of label + input.
   Variants size the individual field. Default minimal width is large enough
   for the label text not to overlap neighbours. */
.bf {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* Row 1: identity fields */
.bf--make    { width: 110px; flex-shrink: 0; }
.bf--year    { width: 70px;  flex-shrink: 0; }
.bf--model   { width: 150px; flex-shrink: 0; }
.bf--wide    { flex: 1.2; min-width: 140px; }
.bf--engine  { flex: 1;   min-width: 110px; }
.bf--notes   { flex: 1.6; min-width: 140px; }

/* Row 2: spec / categorical / tire width */
.bf--num     { width: 80px;  flex-shrink: 0; }
.bf--sel     { width: 100px; flex-shrink: 0; }
.bf--narrow  { width: 64px;  flex-shrink: 0; }
.bf--feel    { width: 130px; flex-shrink: 0; }

.bf-divider {
  width: 1px;
  height: 26px;
  background: rgba(255, 85, 0, 0.18);
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 0.18rem;
}

.build-stat-row { display: flex; align-items: center; gap: 0.25rem; }

/* Slightly compact labels in the build bar so multi-row stays readable */
.tp-build .t-lbl {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Main layout ──────────────────────────────────────── */
.tp-main {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 0.65rem;
  align-items: start;
}

/* ── Parameter grid ───────────────────────────────────── */
.tp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.65rem;
  align-items: start;
}
.tp-col { display: flex; flex-direction: column; gap: 0.55rem; }

/* ── Section card ─────────────────────────────────────── */
.ts {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-up) 100%);
  border: 1px solid var(--c-border-mid);
  border-radius: 8px;
  overflow: hidden;
}
.ts-hd {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  background: rgba(255, 85, 0, 0.06);
  border-bottom: 1px solid rgba(255, 85, 0, 0.12);
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-drift);
}
.ts-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px; height: 16px;
  background: rgba(255, 85, 0, 0.18);
  border: 1px solid rgba(255, 85, 0, 0.42);
  color: var(--c-drift);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  border-radius: 3px;
  letter-spacing: 0;
  flex-shrink: 0;
}
.ts-ico { width: 12px; height: 12px; flex-shrink: 0; opacity: 0.75; }
.ts-range {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  color: var(--c-text-dim);
  font-weight: 400;
  letter-spacing: 0;
}

/* ── Parameter row ────────────────────────────────────── */
.tr {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.42rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.025);
}
.tr:last-child { border-bottom: none; }

.t-p {
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-text-mid);
  width: 88px;
  flex-shrink: 0;
}

.t-pair { display: flex; gap: 0.4rem; flex: 1; min-width: 0; }
.t-fld  { display: flex; align-items: center; gap: 0.3rem; flex: 1; min-width: 0; }

.t-ax {
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}
.t-ax.f { color: var(--c-data); }
.t-ax.r { color: var(--c-drift); }

.t-u {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  color: var(--c-text-dim);
  flex-shrink: 0;
}

/* ── Label ────────────────────────────────────────────── */
.t-lbl {
  display: block;
  font-family: var(--font-display);
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-text-mid);
  margin-bottom: 0.25rem;
}

/* ── Number input ─────────────────────────────────────── */
.t-num {
  width: 100%;
  min-width: 0;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 85, 0, 0.2);
  border-radius: 5px;
  padding: 0.28rem 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--c-data);
  text-align: right;
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.t-num--sm { font-size: 0.72rem; padding: 0.28rem 0.3rem; width: 60px; }
.t-num:focus { border-color: var(--c-drift); box-shadow: 0 0 0 2px rgba(255,85,0,0.1); color: var(--c-text); }
.t-num::-webkit-outer-spin-button,
.t-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.t-num[type=number] { -moz-appearance: textfield; }

/* ── Text input ───────────────────────────────────────── */
.t-text {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 85, 0, 0.2);
  border-radius: 5px;
  padding: 0.32rem 0.5rem;
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.t-text--sm { font-size: 0.76rem; font-weight: 500; padding: 0.28rem 0.45rem; }
.t-text:focus { border-color: var(--c-drift); box-shadow: 0 0 0 2px rgba(255,85,0,0.1); }
.t-text::placeholder { color: var(--c-text-dim); font-weight: 400; font-size: 0.8rem; opacity: 0.6; }

/* ── Select ───────────────────────────────────────────── */
.t-sel {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 85, 0, 0.2);
  border-radius: 5px;
  padding: 0.3rem 1.4rem 0.3rem 0.4rem;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--c-text);
  outline: none;
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23FF5500' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.35rem center;
  background-size: 10px;
  transition: border-color 0.12s;
  width: 100%;
}
.t-sel:focus { border-color: var(--c-drift); }
.t-sel option { background: #0c0818; color: var(--c-text); }

/* Feel rating — color-coded per state */
.feel-info { width: 11px; height: 11px; opacity: 0.4; vertical-align: -2px; margin-left: 2px; }
.feel-sel[data-feel="good"]   { border-color: rgba(0,255,136,0.5);  color: var(--c-green);  background: rgba(0,255,136,0.05); }
.feel-sel[data-feel="medium"] { border-color: rgba(255,178,0,0.5);  color: var(--c-amber);  background: rgba(255,178,0,0.05); }
.feel-sel[data-feel="bad"]    { border-color: rgba(255,60,60,0.55); color: var(--c-red);    background: rgba(255,60,60,0.06); }
.feel-sel[data-feel="na"]     { opacity: 0.85; }

/* ── Gear grid ────────────────────────────────────────── */
.gear-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
}
.gear-cell { display: flex; flex-direction: column; gap: 0.15rem; }
.gear-lbl {
  font-family: var(--font-display);
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-text-dim);
  text-align: center;
}
.gear-num { text-align: center; padding: 0.25rem 0.2rem; font-size: 0.72rem; }

/* ══════════════════════════════════════════════════════
   REVISIONS PANEL
══════════════════════════════════════════════════════ */
.rev-panel {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-up) 100%);
  border: 1px solid var(--c-border-mid);
  border-radius: 9px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rev-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.75rem;
  background: rgba(255, 85, 0, 0.06);
  border-bottom: 1px solid rgba(255, 85, 0, 0.12);
}
.rev-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-display);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-drift);
}
.rev-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--c-text-mid);
  background: rgba(255,85,0,0.1);
  border: 1px solid rgba(255,85,0,0.2);
  border-radius: 10px;
  padding: 0.05rem 0.4rem;
}

.rev-save-row {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.rev-name-inp {
  flex: 1;
  font-size: 0.7rem;
  padding: 0.25rem 0.4rem;
}
.rev-name-inp::placeholder { font-size: 0.66rem; }
.rev-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.55rem;
  background: rgba(255,85,0,0.1);
  border: 1px solid rgba(255,85,0,0.3);
  border-radius: 5px;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-drift);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s;
}
.rev-save-btn:hover:not(:disabled) { background: rgba(255,85,0,0.2); border-color: var(--c-drift); }
.rev-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rev-flash {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.62rem;
  color: var(--c-green);
  font-family: var(--font-display);
  padding: 0.2rem 0.6rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

/* ── Reference tune library ───────────────────────────── */
.ref-section {
  padding: 0.55rem 0.6rem 0.6rem;
  background: rgba(0, 255, 136, 0.025);
  border-bottom: 1px solid rgba(0, 255, 136, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ref-title {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--c-green);
  text-transform: uppercase;
}
.ref-count {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-green);
  background: rgba(0,255,136,0.1);
  border: 1px solid rgba(0,255,136,0.3);
  border-radius: 2px;
  padding: 0 5px;
}
.ref-help {
  font-size: 0.6rem;
  color: var(--c-text-mid);
  line-height: 1.45;
  font-style: italic;
}
.ref-mark-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: rgba(0,255,136,0.08);
  border: 1px solid rgba(0,255,136,0.42);
  color: var(--c-green);
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 0.34rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.15s;
}
.ref-mark-btn:hover:not(:disabled) { background: rgba(0,255,136,0.18); }
.ref-mark-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ref-form {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.ref-notes { resize: vertical; min-height: 2.4rem; }
.ref-form-row { display: flex; gap: 0.3rem; }
.ref-cancel {
  flex: 1;
  background: transparent;
  border: 1px solid var(--c-border-mid);
  color: var(--c-text-mid);
  font-family: var(--font-display);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.34rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
}
.ref-cancel:hover { color: var(--c-red); border-color: var(--c-red); }
.ref-save { flex: 1.4; }
.ref-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 180px;
  overflow-y: auto;
  margin-top: 0.1rem;
}
.ref-item {
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(0,255,136,0.18);
  border-radius: 3px;
  padding: 0.32rem 0.42rem;
}
.ref-item-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.3rem;
}
.ref-item-label {
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--c-green);
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ref-del {
  background: transparent;
  border: 1px solid rgba(255,60,60,0.25);
  color: var(--c-red);
  font-family: var(--font-mono);
  font-size: 0.56rem;
  padding: 1px 5px;
  border-radius: 2px;
  cursor: pointer;
}
.ref-del--confirm { background: var(--c-red); color: #fff; }
.ref-item-car {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-data);
  margin-top: 0.1rem;
}
.ref-item-notes {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--c-text-mid);
  margin-top: 0.15rem;
  line-height: 1.4;
}

.rev-divider {
  height: 1px;
  background: rgba(255, 85, 0, 0.1);
  margin: 0 0.6rem;
}
.flash-enter-active, .flash-leave-active { transition: opacity 0.25s; }
.flash-enter-from, .flash-leave-to { opacity: 0; }

.rev-list {
  overflow-y: auto;
  max-height: calc(100vh - 22rem);
  display: flex;
  flex-direction: column;
}
.rev-empty {
  padding: 1rem 0.75rem;
  font-size: 0.68rem;
  color: var(--c-text-mid);
  text-align: center;
  line-height: 1.6;
  font-style: italic;
}

.rev-item {
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.rev-item:last-child { border-bottom: none; }
.rev-item:first-child { background: rgba(255,85,0,0.03); }

.rev-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rev-num {
  font-family: var(--font-display);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-drift);
  text-transform: uppercase;
}
.rev-date {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  color: var(--c-text-mid);
}
.rev-name {
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--c-text);
}
.rev-car {
  font-size: 0.6rem;
  color: var(--c-data);
  font-family: var(--font-mono);
}
.rev-params {
  font-family: var(--font-mono);
  font-size: 0.56rem;
  color: var(--c-text-mid);
  line-height: 1.5;
}
.rev-actions {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.2rem;
}
.rev-act-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.18rem 0.45rem;
  border-radius: 4px;
  font-family: var(--font-display);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.1s;
  border: 1px solid transparent;
}
/* Diff button states */
.rev-act-btn--diff {
  border-color: rgba(255, 85, 0, 0.32);
  color: var(--c-drift);
}
.rev-act-btn--diff:hover { background: rgba(255, 85, 0, 0.08); }
.rev-act-btn--diff-a {
  background: rgba(0, 204, 255, 0.18);
  border-color: var(--c-data);
  color: var(--c-data);
  font-weight: 700;
}
.rev-act-btn--diff-b {
  background: rgba(255, 85, 0, 0.18);
  border-color: var(--c-drift);
  color: var(--c-drift);
  font-weight: 700;
}

/* Diff panel */
.diff-panel {
  margin-bottom: 0.65rem;
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-up) 100%);
  border: 1px solid rgba(255, 85, 0, 0.28);
  border-radius: 8px;
  overflow: hidden;
}
.diff-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border-bottom: 1px solid rgba(255, 85, 0, 0.18);
  flex-wrap: wrap;
}
.diff-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-text);
}
.diff-ab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-left: auto;
}
.diff-tag {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.18rem 0.5rem;
  border-radius: 3px;
  border: 1px solid currentColor;
}
.diff-tag--a { color: var(--c-data); background: rgba(0,204,255,0.08); }
.diff-tag--b { color: var(--c-drift); background: rgba(255,85,0,0.1); }
.diff-close {
  background: transparent;
  border: 1px solid var(--c-border-mid);
  color: var(--c-text-mid);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  padding: 0.22rem 0.5rem;
  border-radius: 3px;
  cursor: pointer;
}
.diff-close:hover { color: var(--c-red); border-color: var(--c-red); }
.diff-table {
  max-height: 50vh;
  overflow-y: auto;
  font-family: var(--font-mono);
}
.diff-row {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 0.7fr;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  font-size: 0.7rem;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.diff-row--head {
  background: rgba(0,0,0,0.3);
  color: var(--c-text-mid);
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  position: sticky;
  top: 0;
  z-index: 1;
}
.diff-row--changed { background: rgba(255, 85, 0, 0.04); }
.diff-param { color: var(--c-text); }
.diff-group {
  color: var(--c-text-mid);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
}
.diff-val { font-variant-numeric: tabular-nums; }
.diff-val--a { color: var(--c-data); }
.diff-val--b { color: var(--c-text); }
.diff-row--changed .diff-val--b { color: var(--c-drift); font-weight: 600; }
.diff-delta { color: var(--c-text-dim); text-align: right; }
.diff-delta--hot {
  color: var(--c-green);
  font-weight: 700;
}

.diff-fade-enter-active, .diff-fade-leave-active { transition: opacity 0.18s, transform 0.18s; }
.diff-fade-enter-from, .diff-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.rev-act-btn--load {
  background: rgba(0,204,255,0.07);
  border-color: rgba(0,204,255,0.2);
  color: var(--c-data);
}
.rev-act-btn--load:hover { background: rgba(0,204,255,0.15); border-color: var(--c-data); }
.rev-act-btn--del {
  background: rgba(255,23,68,0.05);
  border-color: rgba(255,23,68,0.15);
  color: var(--c-text-mid);
  margin-left: auto;
}
.rev-act-btn--del:hover { border-color: var(--c-red); color: var(--c-red); }
.rev-act-btn--confirm {
  background: rgba(255,23,68,0.12);
  border-color: rgba(255,23,68,0.4);
  color: var(--c-red);
  margin-left: auto;
  font-size: 0.54rem;
}
</style>
