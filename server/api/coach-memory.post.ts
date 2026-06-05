import { addMemory } from '../utils/coach-memory-store'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string; carName?: string; carKey?: string; sessionId?: string }>(event)
  if (!body?.text?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'text required' })
  }
  return addMemory(body.text, body.carName, body.carKey, body.sessionId)
})
