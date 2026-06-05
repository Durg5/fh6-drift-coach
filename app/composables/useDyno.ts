import { useTune } from './useTune'
import { useTelemetry } from './useTelemetry'

export interface DynoBin {
  rpm: number          // bin center
  powerHpMax: number
  torqueLbFtMax: number
  sampleCount: number
}

export interface DynoCurve {
  carKey: string
  bins: Record<string, DynoBin>
  updatedAt: string
}

// 250-rpm bins is a good compromise: enough resolution to find the peak,
// not so fine that bins stay empty after a couple of pulls.
const BIN_WIDTH = 250
// Only count samples where the engine is making real power.
// Forza power is in WATTS (not hp) and torque is in N·m.
const MIN_THROTTLE = 200      // ~78% throttle (0-255)
const MIN_RPM = 1500          // ignore idle / pre-engagement
const MIN_HP = 20

export const useDyno = () => {
  const { carKey } = useTune()
  const { telemetry } = useTelemetry()

  // Bins for the CURRENT car, keyed by lower-edge of bin (string for JSON friendliness).
  const bins = useState<Record<string, DynoBin>>('dc-dyno-bins', () => ({}))
  // Bins accumulated since last sync — sent to server in batches.
  const pendingBins = ref<Record<string, DynoBin>>({})
  let lastSyncMs = 0

  async function loadForCurrentCar() {
    if (!carKey.value) { bins.value = {}; return }
    try {
      const data = await $fetch<DynoCurve>(`/api/dyno/${encodeURIComponent(carKey.value)}`)
      bins.value = data.bins ?? {}
    } catch {
      bins.value = {}
    }
  }

  async function flushPending() {
    const ck = carKey.value
    if (!ck || !Object.keys(pendingBins.value).length) return
    const batch = pendingBins.value
    pendingBins.value = {}
    try {
      const updated = await $fetch<DynoCurve>(`/api/dyno/${encodeURIComponent(ck)}`, {
        method: 'POST',
        body: { bins: batch },
      })
      bins.value = updated.bins ?? bins.value
    } catch {
      // Restore the batch so we try again next tick.
      pendingBins.value = { ...batch, ...pendingBins.value }
    }
  }

  // Reset dyno for the current car (e.g. after major engine upgrade).
  async function resetCurrent() {
    if (!carKey.value) return
    try {
      await $fetch(`/api/dyno/${encodeURIComponent(carKey.value)}`, { method: 'DELETE' })
      bins.value = {}
      pendingBins.value = {}
    } catch { /* ignore */ }
  }

  // Sample telemetry — accumulate peaks per bin
  watch(telemetry, (frame) => {
    if (!frame) return
    if (frame.throttle < MIN_THROTTLE) return
    if (frame.currentEngineRpm < MIN_RPM) return
    if (frame.gear === 0) return  // neutral has weird readings

    const rpm = frame.currentEngineRpm
    const binLower = Math.floor(rpm / BIN_WIDTH) * BIN_WIDTH
    const binKey = String(binLower)
    const binCenter = binLower + BIN_WIDTH / 2

    const hp    = frame.power / 745.7
    const lbFt  = frame.torque * 0.7376
    if (hp < MIN_HP) return

    const ex = bins.value[binKey]
    const merged: DynoBin = {
      rpm: binCenter,
      powerHpMax:    Math.max(ex?.powerHpMax ?? 0, hp),
      torqueLbFtMax: Math.max(ex?.torqueLbFtMax ?? 0, lbFt),
      sampleCount:  (ex?.sampleCount ?? 0) + 1,
    }
    // Only update when peak grows OR every 30th sample (so sampleCount stays current)
    if (
      merged.powerHpMax > (ex?.powerHpMax ?? 0)
      || merged.torqueLbFtMax > (ex?.torqueLbFtMax ?? 0)
      || merged.sampleCount % 30 === 0
    ) {
      bins.value = { ...bins.value, [binKey]: merged }
      pendingBins.value = { ...pendingBins.value, [binKey]: merged }
    }

    // Throttled sync — at most every 5s
    const now = Date.now()
    if (now - lastSyncMs > 5000 && Object.keys(pendingBins.value).length > 0) {
      lastSyncMs = now
      flushPending()
    }
  })

  // Refetch when the active car changes — every car has its own curve.
  watch(carKey, loadForCurrentCar, { immediate: true })

  // Derived: sorted array + peaks for display + power band edges
  const sortedBins = computed<DynoBin[]>(() => {
    return Object.values(bins.value).sort((a, b) => a.rpm - b.rpm)
  })
  const peakPower = computed<DynoBin | null>(() => {
    const arr = sortedBins.value
    if (!arr.length) return null
    return arr.reduce((m, b) => (b.powerHpMax > m.powerHpMax ? b : m), arr[0]!)
  })
  const peakTorque = computed<DynoBin | null>(() => {
    const arr = sortedBins.value
    if (!arr.length) return null
    return arr.reduce((m, b) => (b.torqueLbFtMax > m.torqueLbFtMax ? b : m), arr[0]!)
  })
  // Power band: RPM range where power >= 90% of peak (drift-tuning sweet zone for gearing)
  const powerBand = computed<{ low: number; high: number } | null>(() => {
    const arr = sortedBins.value
    const peak = peakPower.value
    if (!peak || !arr.length) return null
    const cutoff = peak.powerHpMax * 0.9
    const inBand = arr.filter(b => b.powerHpMax >= cutoff)
    if (!inBand.length) return null
    return {
      low:  inBand[0]!.rpm - BIN_WIDTH / 2,
      high: inBand[inBand.length - 1]!.rpm + BIN_WIDTH / 2,
    }
  })

  return {
    bins, sortedBins, peakPower, peakTorque, powerBand,
    loadForCurrentCar, flushPending, resetCurrent,
  }
}
