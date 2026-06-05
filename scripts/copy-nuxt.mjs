// copy-nuxt.mjs
//
// Tauri bundles whatever lives in src-tauri/nuxt/ as an app resource. This
// script copies the Nitro build output (.output) there before `cargo tauri
// build` runs. Cross-platform via Node fs (no shell tricks).

import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const src = join(root, '.output')
const dst = join(root, 'src-tauri', 'nuxt')

if (!existsSync(src)) {
  console.error('[copy-nuxt] no .output directory yet — run `npm run build` first')
  process.exit(1)
}

if (existsSync(dst)) {
  console.log('[copy-nuxt] clearing existing src-tauri/nuxt')
  rmSync(dst, { recursive: true, force: true })
}

mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.log(`[copy-nuxt] copied ${src} → ${dst}`)
