import { readSession } from '../../utils/sessions-store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const session = readSession(id)
  if (!session) throw createError({ statusCode: 404, statusMessage: 'not found' })
  return session
})
