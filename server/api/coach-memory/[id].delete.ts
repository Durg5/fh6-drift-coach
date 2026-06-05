import { deleteMemory } from '../../utils/coach-memory-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  deleteMemory(id)
  return { ok: true }
})
