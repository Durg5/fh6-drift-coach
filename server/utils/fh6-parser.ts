import type { ForzaTelemetry, GameVersion } from '../../shared/telemetry-types'

const R2D = 180 / Math.PI

function f(buf: Buffer, offset: number) { return buf.readFloatLE(offset) }
function i32(buf: Buffer, offset: number) { return buf.readInt32LE(offset) }
function u32(buf: Buffer, offset: number) { return buf.readUInt32LE(offset) }
function u16(buf: Buffer, offset: number) { return buf.readUInt16LE(offset) }
function u8(buf: Buffer, offset: number) { return buf.readUInt8(offset) }
function i8(buf: Buffer, offset: number) { return buf.readInt8(offset) }
function fToC(fahrenheit: number) { return (fahrenheit - 32) * 5 / 9 }

// FH5 = 311 bytes, dash section starts at 232
// FH6 = 323+ bytes, FH6-only block at 232-243, dash section starts at 244
export function parsePacket(buf: Buffer): ForzaTelemetry | null {
  if (buf.length < 232) return null

  const version: GameVersion = buf.length >= 323 ? 'fh6' : 'fh5'
  const D = version === 'fh6' ? 244 : 232   // Dash section offset

  if (buf.length < D + 79) return null       // need at least through steer

  // ── Sled section (0–231, identical fh5/fh6) ──────────────────
  const isRaceOn      = i32(buf, 0) !== 0
  const timestampMs   = u32(buf, 4)
  const engineMaxRpm  = f(buf, 8)
  const engineIdleRpm = f(buf, 12)
  const currentEngineRpm = f(buf, 16)

  const accelX = f(buf, 20)
  const accelY = f(buf, 24)
  const accelZ = f(buf, 28)

  const velX = f(buf, 32)
  const velY = f(buf, 36)
  const velZ = f(buf, 40)

  const angVelX = f(buf, 44)
  const angVelY = f(buf, 48)   // yaw rate rad/s
  const angVelZ = f(buf, 52)

  const yaw   = f(buf, 56)
  const pitch = f(buf, 60)
  const roll  = f(buf, 64)

  const suspNorm = {
    fl: f(buf, 68), fr: f(buf, 72),
    rl: f(buf, 76), rr: f(buf, 80),
  }

  const slipRatio = {
    fl: f(buf, 84), fr: f(buf, 88),
    rl: f(buf, 92), rr: f(buf, 96),
  }

  const wheelSpeed = {
    fl: f(buf, 100), fr: f(buf, 104),
    rl: f(buf, 108), rr: f(buf, 112),
  }

  const onRumble = {
    fl: i32(buf, 116) !== 0, fr: i32(buf, 120) !== 0,
    rl: i32(buf, 124) !== 0, rr: i32(buf, 128) !== 0,
  }

  const puddleDepth = {
    fl: i32(buf, 132), fr: i32(buf, 136),
    rl: i32(buf, 140), rr: i32(buf, 144),
  }

  const surfaceRumble = {
    fl: f(buf, 148), fr: f(buf, 152),
    rl: f(buf, 156), rr: f(buf, 160),
  }

  const slipAngle = {     // lateral slip angle in radians — KEY DRIFT METRIC
    fl: f(buf, 164), fr: f(buf, 168),
    rl: f(buf, 172), rr: f(buf, 176),
  }

  const combinedSlip = {  // 0=full grip, >1=sliding — BEST DRIFT SIGNAL
    fl: f(buf, 180), fr: f(buf, 184),
    rl: f(buf, 188), rr: f(buf, 192),
  }

  const suspMeters = {
    fl: f(buf, 196), fr: f(buf, 200),
    rl: f(buf, 204), rr: f(buf, 208),
  }

  const carOrdinal    = i32(buf, 212)
  const carClass      = i32(buf, 216)
  const carPI         = i32(buf, 220)
  const drivetrain    = i32(buf, 224)
  const numCylinders  = i32(buf, 228)

  // ── FH6-only block (232–243) ──────────────────────────────────
  let carGroup: number | undefined
  let smashableVelDiff: number | undefined

  if (version === 'fh6' && buf.length >= 244) {
    carGroup         = u32(buf, 232)
    smashableVelDiff = f(buf, 236)
  }

  // ── Dash section (D = 244 for fh6, 232 for fh5) ──────────────
  const posX = f(buf, D + 0)
  const posY = f(buf, D + 4)
  const posZ = f(buf, D + 8)

  const speedMps  = f(buf, D + 12)
  const speedKmh  = speedMps * 3.6
  const speedMph  = speedMps * 2.23694
  const power     = f(buf, D + 16)
  const torque    = f(buf, D + 20)

  const tireTempF = {
    fl: f(buf, D + 24), fr: f(buf, D + 28),
    rl: f(buf, D + 32), rr: f(buf, D + 36),
  }
  const tireTempC = {
    fl: fToC(tireTempF.fl), fr: fToC(tireTempF.fr),
    rl: fToC(tireTempF.rl), rr: fToC(tireTempF.rr),
  }

  const boost             = f(buf, D + 40)
  const fuel              = f(buf, D + 44)
  const distanceTraveled  = f(buf, D + 48)
  const bestLap           = f(buf, D + 52)
  const lastLap           = f(buf, D + 56)
  const currentLap        = f(buf, D + 60)
  const currentRaceTime   = f(buf, D + 64)
  const lapNumber         = u16(buf, D + 68)
  const racePosition      = u8(buf, D + 70)
  const throttle          = u8(buf, D + 71)
  const brake             = u8(buf, D + 72)
  const clutch            = u8(buf, D + 73)
  const handbrake         = u8(buf, D + 74) > 0
  const gear              = u8(buf, D + 75)
  const steer             = i8(buf, D + 76)   // -127 to 127

  // Tire wear (optional, bytes after dash)
  const wearOffset = D + 79
  const tireWear = buf.length >= wearOffset + 16 ? {
    fl: f(buf, wearOffset + 0),
    fr: f(buf, wearOffset + 4),
    rl: f(buf, wearOffset + 8),
    rr: f(buf, wearOffset + 12),
  } : undefined

  // ── Derived drift metrics ─────────────────────────────────────

  // Velocity-vector drift angle — 0 when nearly stopped to avoid garbage atan2
  const driftAngleDeg = speedMps < 1.0 ? 0
    : Math.atan2(velX, Math.max(0.1, Math.abs(velZ))) * R2D

  // Rear lateral slip (normalized 0-1 metric, same scale as combinedSlip)
  const rearSlipAngleDeg = (Math.abs(slipAngle.rl) + Math.abs(slipAngle.rr)) / 2

  // Front/rear combined slip averages (normalized: 0=grip, approaching 1=sliding)
  const frontCombinedSlip = (Math.abs(combinedSlip.fl) + Math.abs(combinedSlip.fr)) / 2
  const rearCombinedSlip  = (Math.abs(combinedSlip.rl) + Math.abs(combinedSlip.rr)) / 2

  // Drift: body angle > 8° (velocity-vector method) OR rears slipping more than fronts
  const isDrifting = speedKmh > 10 && (
    Math.abs(driftAngleDeg) > 8 ||
    rearCombinedSlip > frontCombinedSlip * 1.3
  )

  // Direction from lateral velocity sign
  const driftDirection = Math.abs(velX) < 1 ? 'none'
                       : velX > 0 ? 'right' : 'left'

  const yawRateDegS = angVelY * R2D

  // Counter-steer: steering opposite to drift direction
  const counterSteer = (driftDirection === 'right' && steer < -10)
                    || (driftDirection === 'left'  && steer >  10)

  return {
    version, isRaceOn, timestampMs,
    engineMaxRpm, engineIdleRpm, currentEngineRpm,
    accelX, accelY, accelZ,
    velX, velY, velZ,
    angVelX, angVelY, angVelZ,
    yaw, pitch, roll,
    suspNorm, slipRatio, wheelSpeed, onRumble, puddleDepth, surfaceRumble,
    slipAngle, combinedSlip, suspMeters,
    carOrdinal, carClass, carPI, drivetrain, numCylinders,
    carGroup, smashableVelDiff,
    posX, posY, posZ,
    speedMps, speedKmh, speedMph, power, torque,
    tireTempF, tireTempC,
    boost, fuel, distanceTraveled, bestLap, lastLap, currentLap, currentRaceTime,
    lapNumber, racePosition,
    throttle, brake, clutch, handbrake, gear, steer, tireWear,
    driftAngleDeg, rearSlipAngleDeg, frontCombinedSlip, rearCombinedSlip,
    isDrifting, driftDirection, yawRateDegS, counterSteer,
  }
}
