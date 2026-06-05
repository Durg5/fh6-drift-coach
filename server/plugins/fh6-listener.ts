import dgram from 'node:dgram'
import { telemetryBus } from '../utils/telemetry-bus'
import { parsePacket } from '../utils/fh6-parser'

export default defineNitroPlugin(() => {
  const port = parseInt(process.env.FORZA_PORT ?? '5330', 10)
  const bind = process.env.FORZA_BIND ?? '0.0.0.0'

  const sock = dgram.createSocket('udp4')

  sock.on('message', (msg) => {
    const frame = parsePacket(msg)
    if (frame && frame.isRaceOn) {
      telemetryBus.emit('frame', frame)
    }
  })

  sock.on('error', (err) => {
    console.error('[fh6-listener] UDP error:', err.message)
    sock.close()
  })

  sock.bind(port, bind, () => {
    console.log(`[fh6-listener] UDP listening on ${bind}:${port} (fh5/fh6 auto-detect)`)
  })
})
