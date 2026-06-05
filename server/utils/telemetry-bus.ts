import { EventEmitter } from 'node:events'
import type { ForzaTelemetry } from '../../shared/telemetry-types'

class TelemetryBus extends EventEmitter {
  emit(event: 'frame', frame: ForzaTelemetry): boolean
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args)
  }

  on(event: 'frame', listener: (frame: ForzaTelemetry) => void): this
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener)
  }
}

export const telemetryBus = new TelemetryBus()
