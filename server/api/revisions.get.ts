import { readFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FILE = join(homedir(), '.config', 'drift-coach', 'revisions.json')

export default defineEventHandler(() => {
  try {
    return JSON.parse(readFileSync(FILE, 'utf-8'))
  } catch {
    return []
  }
})
