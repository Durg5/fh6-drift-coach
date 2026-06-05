import { telemetryBus } from '../../../utils/telemetry-bus'
import type { ForzaTelemetry } from '../../../../shared/telemetry-types'

export default defineWebSocketHandler({
  open(peer) {
    const onFrame = (frame: ForzaTelemetry) => {
      peer.send(JSON.stringify(frame))
    }
    telemetryBus.on('frame', onFrame)
    ;(peer as unknown as { _onFrame: typeof onFrame })._onFrame = onFrame
  },

  close(peer) {
    const onFrame = (peer as unknown as { _onFrame?: (f: ForzaTelemetry) => void })._onFrame
    if (onFrame) telemetryBus.off('frame', onFrame)
  },

  error(peer) {
    const onFrame = (peer as unknown as { _onFrame?: (f: ForzaTelemetry) => void })._onFrame
    if (onFrame) telemetryBus.off('frame', onFrame)
  },
})
