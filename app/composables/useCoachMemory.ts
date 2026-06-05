import { useTune } from './useTune'

export interface CoachMemoryEntry {
  id: string
  createdAt: string
  text: string
  carName?: string
  sessionId?: string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-CA') + ' ' +
    d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export const useCoachMemory = () => {
  const { tune, carKey } = useTune()
  const entries = useState<CoachMemoryEntry[]>('dc-coach-memory', () => [])
  const adding = ref(false)

  async function fetchAll() {
    try {
      const url = carKey.value
        ? `/api/coach-memory?carKey=${encodeURIComponent(carKey.value)}`
        : '/api/coach-memory'
      entries.value = await $fetch<CoachMemoryEntry[]>(url)
    } catch { entries.value = [] }
  }

  async function add(text: string, opts: { sessionId?: string } = {}) {
    const t = text.trim()
    if (!t) return
    adding.value = true
    try {
      const created = await $fetch<CoachMemoryEntry>('/api/coach-memory', {
        method: 'POST',
        body: {
          text: t,
          carName: tune.carName || undefined,
          carKey: carKey.value || undefined,
          sessionId: opts.sessionId,
        },
      })
      entries.value = [created, ...entries.value]
    } finally {
      adding.value = false
    }
  }

  // Refetch when the active car changes
  watch(carKey, fetchAll)

  async function remove(id: string) {
    await $fetch(`/api/coach-memory/${id}`, { method: 'DELETE' })
    entries.value = entries.value.filter(e => e.id !== id)
  }

  // Text blob the AI receives — most-recent first, capped to ~30 entries
  const memoryAsText = computed<string>(() => {
    const items = entries.value.slice(0, 30)
    if (!items.length) return ''
    const lines = items.map(e => {
      const meta = [fmtDate(e.createdAt), e.carName].filter(Boolean).join(' · ')
      return `- (${meta}) ${e.text}`
    })
    return [
      `COACH MEMORY — durable feedback the driver has given over time.`,
      `Treat these as adaptive overrides to your default tuning instincts.`,
      `If a past note contradicts a textbook recommendation, lean toward the past note unless the data clearly shows otherwise.`,
      ``,
      ...lines,
    ].join('\n')
  })

  onMounted(fetchAll)

  return { entries, adding, fetchAll, add, remove, memoryAsText }
}
