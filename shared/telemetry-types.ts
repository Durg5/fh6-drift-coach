export type GameVersion = 'fh5' | 'fh6'

export interface ForzaTelemetry {
  // Packet meta
  version: GameVersion
  isRaceOn: boolean
  timestampMs: number

  // Engine
  engineMaxRpm: number
  engineIdleRpm: number
  currentEngineRpm: number

  // Body dynamics (car-local frame)
  accelX: number      // lateral m/s²  (right=+)
  accelY: number      // vertical m/s²
  accelZ: number      // longitudinal m/s²  (forward=+)

  // World-space velocity
  velX: number        // lateral m/s
  velY: number        // vertical m/s
  velZ: number        // forward m/s

  // Angular velocity (rad/s)
  angVelX: number     // pitch
  angVelY: number     // YAW — primary drift metric
  angVelZ: number     // roll

  // Euler angles (rad)
  yaw: number
  pitch: number
  roll: number

  // Suspension (0=extended, 1=compressed)
  suspNorm: { fl: number; fr: number; rl: number; rr: number }

  // Tire longitudinal slip ratio (0=locked, >0=spinning)
  slipRatio: { fl: number; fr: number; rl: number; rr: number }

  // Wheel angular velocity (rad/s)
  wheelSpeed: { fl: number; fr: number; rl: number; rr: number }

  // Surface: rumble strip (bool) and puddle depth (m)
  onRumble: { fl: boolean; fr: boolean; rl: boolean; rr: boolean }
  puddleDepth: { fl: number; fr: number; rl: number; rr: number }
  surfaceRumble: { fl: number; fr: number; rl: number; rr: number }

  // Tire lateral slip angle (rad) — KEY DRIFT METRIC
  slipAngle: { fl: number; fr: number; rl: number; rr: number }

  // Combined slip (0=full grip, >1=sliding) — BEST SINGLE DRIFT SIGNAL
  combinedSlip: { fl: number; fr: number; rl: number; rr: number }

  // Suspension travel in meters
  suspMeters: { fl: number; fr: number; rl: number; rr: number }

  // Car identity
  carOrdinal: number
  carClass: number          // 0=D 1=C 2=B 3=A 4=S1 5=S2 6=X
  carPI: number
  drivetrain: number        // 0=FWD 1=RWD 2=AWD
  numCylinders: number

  // FH6-only (undefined if fh5)
  carGroup?: number
  smashableVelDiff?: number // collision impact spike

  // World position
  posX: number
  posY: number
  posZ: number

  // Speed & power
  speedMps: number
  speedKmh: number
  speedMph: number
  power: number             // watts
  torque: number            // N·m

  // Tire temp in °F (game native) and °C (converted)
  tireTempF: { fl: number; fr: number; rl: number; rr: number }
  tireTempC: { fl: number; fr: number; rl: number; rr: number }

  // Other
  boost: number             // PSI
  fuel: number              // 0-1
  distanceTraveled: number  // m
  bestLap: number           // s
  lastLap: number           // s
  currentLap: number        // s
  currentRaceTime: number   // s
  lapNumber: number
  racePosition: number

  // Controls (raw)
  throttle: number          // 0-255
  brake: number             // 0-255
  clutch: number            // 0-255
  handbrake: boolean
  gear: number              // 0=N, 1-10, >10=shifting
  steer: number             // -127 to 127

  // Tire wear (undefined if not in packet)
  tireWear?: { fl: number; fr: number; rl: number; rr: number }

  // --- DERIVED drift metrics ---
  driftAngleDeg: number         // velocity-based lateral slip angle in degrees (0 when speed < 1 m/s)
  rearSlipAngleDeg: number      // avg rear tire lateral slip (normalized 0-1)
  frontCombinedSlip: number     // avg front combined slip (normalized 0-1)
  rearCombinedSlip: number      // avg rear combined slip (normalized 0-1)
  isDrifting: boolean           // body angle > 8° OR rears slipping > fronts * 1.3
  driftDirection: 'left' | 'right' | 'none'
  yawRateDegS: number           // angVelY in deg/s
  counterSteer: boolean         // steering opposite to drift direction
}
