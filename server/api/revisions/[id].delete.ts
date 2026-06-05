import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR  = join(homedir(), '.config', 'drift-coach')
const FILE = join(DIR, 'revisions.json')

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  try {
    const revs = JSON.parse(readFileSync(FILE, 'utf-8')) as { id: string }[]
    const next = revs.filter(r => r.id !== id)
    writeFileSync(FILE, JSON.stringify(next, null, 2))
    return { ok: true }
  } catch {
    return { ok: true }
  }
})
