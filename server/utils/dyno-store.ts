import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR = join(homedir(), '.config', 'drift-coach', 'dyno')

export interface DynoBin {
  rpm: number          // center of this 250-rpm bin
  powerHpMax: number   // peak hp ever observed at this RPM band
  torqueLbFtMax: number
  sampleCount: number  // how many full-throttle samples landed here
}

export interface DynoCurve {
  carKey: string
  bins: Record<string, DynoBin>  // keyed by lower-edge of bin
  updatedAt: string
}

function pathFor(carKey: string) {
  // Slugify just enough to be a safe filename
  const safe = carKey.replace(/[^a-z0-9_-]/gi, '_') || 'unkeyed'
  return join(DIR, `${safe}.json`)
}

export function loadDyno(carKey: string): DynoCurve {
  try {
    return JSON.parse(readFileSync(pathFor(carKey), 'utf-8')) as DynoCurve
  } catch {
    return { carKey, bins: {}, updatedAt: new Date().toISOString() }
  }
}

export function mergeDyno(
  carKey: string,
  incoming: Record<string, DynoBin>,
): DynoCurve {
  mkdirSync(DIR, { recursive: true })
  const current = loadDyno(carKey)
  for (const [k, b] of Object.entries(incoming)) {
    const ex = current.bins[k]
    if (!ex) {
      current.bins[k] = { ...b }
    } else {
      current.bins[k] = {
        rpm: b.rpm,
        powerHpMax:    Math.max(ex.powerHpMax,    b.powerHpMax),
        torqueLbFtMax: Math.max(ex.torqueLbFtMax, b.torqueLbFtMax),
        sampleCount:   ex.sampleCount + b.sampleCount,
      }
    }
  }
  current.updatedAt = new Date().toISOString()
  writeFileSync(pathFor(carKey), JSON.stringify(current, null, 2), 'utf-8')
  return current
}

export function resetDyno(carKey: string): DynoCurve {
  mkdirSync(DIR, { recursive: true })
  const fresh: DynoCurve = { carKey, bins: {}, updatedAt: new Date().toISOString() }
  writeFileSync(pathFor(carKey), JSON.stringify(fresh, null, 2), 'utf-8')
  return fresh
}
