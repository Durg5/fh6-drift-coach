import { mergeDyno, type DynoBin } from '../../utils/dyno-store'

export default defineEventHandler(async (event) => {
  const carKey = getRouterParam(event, 'carKey')
  if (!carKey) throw createError({ statusCode: 400, statusMessage: 'carKey required' })
  const body = await readBody<{ bins: Record<string, DynoBin> }>(event)
  if (!body?.bins) throw createError({ statusCode: 400, statusMessage: 'bins required' })
  return mergeDyno(decodeURIComponent(carKey), body.bins)
})
