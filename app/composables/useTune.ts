export const useTune = () => {
  const tune = useState('dc-tune', () => ({
    // ── Car identity ──────────────────────────────────────────
    carName:       '',         // user's build nickname (e.g. "4-Rotor 240")
    carMake:       '',         // e.g. "Nissan"
    carYear:       0,          // e.g. 2002
    carModel:      '',         // e.g. "R34 GTR"
    drivetrainType: 'RWD',

    // ── Driver's qualitative rating of the CURRENT tune ───────
    // 'na'     = unrated → full analysis from telemetry
    // 'good'   = dialed → ai gives MINOR refinements (±5-10%)
    // 'medium' = workable → MODERATE corrections (15-25%)
    // 'bad'    = broken  → MAJOR overhaul, rethink direction
    feel: 'na' as 'na' | 'good' | 'medium' | 'bad',
    piClass:       'S1',
    piNumber:      0,       // numeric PI rating e.g. 734
    tireCompound:  'Sport',

    // ── Build spec ────────────────────────────────────────────
    powerHp:       0,
    weightLb:      0,
    weightFrontPct: 50,
    tireWidthF:    245,
    tireWidthR:    275,
    aeroType:      'none',  // none | splitter | wing | both
    engineSwap:    '',
    buildNotes:    '',

    // ── Tires ─────────────────────────────────────────────────
    tirePressureF: 28.0,
    tirePressureR: 30.0,

    // ── Springs & ride height ─────────────────────────────────
    springRateF:  400,
    springRateR:  350,
    rideHeightF:  5.5,
    rideHeightR:  5.5,

    // ── Dampers ───────────────────────────────────────────────
    reboundF: 8,
    reboundR: 7,
    bumpF:    5,
    bumpR:    4,

    // ── ARB ───────────────────────────────────────────────────
    arbF: 22,
    arbR: 18,

    // ── Differential ──────────────────────────────────────────
    diffAccel: 70,
    diffDecel: 30,

    // ── Alignment ─────────────────────────────────────────────
    camberF: -1.5,
    camberR: -1.2,
    casterF:  5.0,
    toeF:     0.0,
    toeR:     0.1,

    // ── Brakes ────────────────────────────────────────────────
    brakeBiasF: 55,
    brakeForce: 100,

    // ── Aero ──────────────────────────────────────────────────
    aeroFront: 0,
    aeroRear:  100,

    // ── Gearing ───────────────────────────────────────────────
    finalDrive: 3.90,
    gear1:  3.40,
    gear2:  2.20,
    gear3:  1.55,
    gear4:  1.15,
    gear5:  0.90,
    gear6:  0.72,
    gear7:  0.00,
    gear8:  0.00,
    gear9:  0.00,
    gear10: 0.00,
  }))

  const tuneAsText = computed(() => {
    const t = tune.value
    const gearList = [t.gear1, t.gear2, t.gear3, t.gear4, t.gear5,
                      t.gear6, t.gear7, t.gear8, t.gear9, t.gear10]
    const activeGears = gearList
      .map((r, i) => ({ n: i + 1, r }))
      .filter(g => g.r > 0)
      .map(g => `${g.n}: ${g.r.toFixed(2)}`)
      .join('  ')

    const buildLines = []
    if (t.powerHp)       buildLines.push(`Power: ${t.powerHp}hp`)
    if (t.weightLb)      buildLines.push(`Weight: ${t.weightLb}lb (${t.weightFrontPct}% front)`)
    if (t.piNumber)      buildLines.push(`PI: ${t.piNumber}`)
    if (t.engineSwap)    buildLines.push(`Engine: ${t.engineSwap}`)
    if (t.tireWidthF)    buildLines.push(`Tire width: F ${t.tireWidthF}mm / R ${t.tireWidthR}mm`)
    if (t.aeroType !== 'none') buildLines.push(`Aero package: ${t.aeroType}`)
    if (t.buildNotes)    buildLines.push(`Build notes: ${t.buildNotes}`)

    // Aero rendered conditionally based on what the car has
    const aeroLine = t.aeroType === 'splitter' ? `7. Aero — Splitter (F) ${t.aeroFront} lbf`
      : t.aeroType === 'wing'                   ? `7. Aero — Wing (R) ${t.aeroRear} lbf`
      : t.aeroType === 'both'                   ? `7. Aero — Splitter (F) ${t.aeroFront} lbf / Wing (R) ${t.aeroRear} lbf`
      : ''

    const feelLine = t.feel === 'na'
      ? ''
      : `Driver's rating of THIS tune: ${t.feel.toUpperCase()} — `
        + (t.feel === 'good'   ? 'tune is dialed; recommend only MINOR refinements (±5-10% values, keep direction).'
         : t.feel === 'medium' ? 'tune works but has weaknesses; MODERATE corrections (15-25%) on the weakest signals.'
                               : 'tune is broken; MAJOR overhaul OK — rethink direction, larger value changes.')

    return [
      `Car: ${t.carName || 'Unknown'} | ${t.drivetrainType} | ${t.piClass}${t.piNumber ? ' ' + t.piNumber : ''} | ${t.tireCompound} tires`,
      ...buildLines,
      feelLine,
      ``,
      `Current tune (FH6 order):`,
      `1. Tires — F ${t.tirePressureF} PSI / R ${t.tirePressureR} PSI`,
      `2. Gearing — Final ${t.finalDrive.toFixed(2)} | ${activeGears}`,
      `3. Alignment — Camber F ${t.camberF}° / R ${t.camberR}° | Toe F ${t.toeF}° / R ${t.toeR}° | Caster ${t.casterF}°`,
      `4. ARB — F ${t.arbF} / R ${t.arbR}`,
      `5. Springs — Rate F ${t.springRateF} / R ${t.springRateR} lb/in | Height F ${t.rideHeightF}" / R ${t.rideHeightR}"`,
      `6. Damping — Rebound F ${t.reboundF} / R ${t.reboundR} | Bump F ${t.bumpF} / R ${t.bumpR}`,
      aeroLine,
      `8. Brake — Balance ${t.brakeBiasF}% F | Force ${t.brakeForce}%`,
      `9. Differential (rear) — Accel ${t.diffAccel}% / Decel ${t.diffDecel}%`,
    ].filter(Boolean).join('\n')
  })

  // Slug for the make+year+model — used to silo sessions / memory / chat per car.
  // Falls back to a slug of the build nickname so users who don't fill make/year/model
  // still get siloed history. Empty if nothing is set.
  function slug(s: string): string {
    return s.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
  const carKey = computed<string>(() => {
    const t = tune.value
    const parts = [t.carMake, t.carModel, t.carYear ? String(t.carYear) : ''].filter(Boolean)
    if (parts.length) return slug(parts.join(' '))
    if (t.carName) return slug(t.carName)
    return ''
  })
  const carLabel = computed<string>(() => {
    const t = tune.value
    const garage = [t.carYear ? String(t.carYear) : '', t.carMake, t.carModel].filter(Boolean).join(' ')
    if (garage && t.carName) return `${garage} · ${t.carName}`
    return garage || t.carName || ''
  })

  return { tune, tuneAsText, carKey, carLabel }
}
