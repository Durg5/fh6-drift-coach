import { writeSession } from '../utils/sessions-store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    name?: string
    notes?: string
    tuneSnapshot: Record<string, unknown>
    stats: Record<string, unknown>
  }>(event)

  if (!body?.tuneSnapshot || !body?.stats) {
    throw createError({ statusCode: 400, statusMessage: 'tuneSnapshot and stats required' })
  }

  const session = writeSession(body.name ?? '', body.tuneSnapshot, body.stats, body.notes)
  return session
})
