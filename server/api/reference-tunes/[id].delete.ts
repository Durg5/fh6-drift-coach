import { deleteReference } from '../../utils/reference-tunes-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  deleteReference(id)
  return { ok: true }
})
