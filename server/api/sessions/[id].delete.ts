import { deleteSession } from '../../utils/sessions-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  deleteSession(id)
  return { ok: true }
})
