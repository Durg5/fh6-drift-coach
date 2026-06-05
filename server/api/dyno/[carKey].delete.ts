import { resetDyno } from '../../utils/dyno-store'

export default defineEventHandler((event) => {
  const carKey = getRouterParam(event, 'carKey')
  if (!carKey) throw createError({ statusCode: 400, statusMessage: 'carKey required' })
  return resetDyno(decodeURIComponent(carKey))
})
