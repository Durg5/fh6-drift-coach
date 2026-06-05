import type { ForzaTelemetry } from '../../shared/telemetry-types'

export function useTelemetry() {
  const telemetry = useState<ForzaTelemetry | null>('dc.telemetry', () => null)
  const wsStatus  = useState<'connecting' | 'live' | 'disconnected'>('dc.wsStatus', () => 'connecting')

  if (import.meta.client) {
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let alive = true

    function connect() {
      if (!alive) return
      wsStatus.value = 'connecting'
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/telemetry/ws`)

      ws.onopen = () => { wsStatus.value = 'live' }

      ws.onmessage = (e) => {
        try { telemetry.value = JSON.parse(e.data) } catch {}
      }

      ws.onclose = ws.onerror = () => {
        wsStatus.value = 'disconnected'
        telemetry.value = null
        if (alive) retryTimer = setTimeout(connect, 2500)
      }
    }

    onMounted(connect)

    onUnmounted(() => {
      alive = false
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    })
  }

  return { telemetry, wsStatus }
}
