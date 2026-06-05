import { listMemory } from '../utils/coach-memory-store'

export default defineEventHandler((event) => {
  const q = getQuery(event)
  const carKey = typeof q.carKey === 'string' ? q.carKey : undefined
  return listMemory(carKey)
})
