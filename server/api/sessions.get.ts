import { listSessions } from '../utils/sessions-store'

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const carKey = typeof q.carKey === 'string' ? q.carKey : undefined
  return listSessions(carKey)
})
