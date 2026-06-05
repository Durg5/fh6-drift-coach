// gen-icons.mjs
//
// Rasterizes icons/icon-source.svg → src-tauri/icons/{32x32,128x128,128x128@2x,icon}.png
// then calls `tauri icon` to produce the platform-specific .icns / .ico bundles.
//
// Run via `npm run desktop:icons` (also runs automatically as part of desktop:build
// on first build).

import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const svgPath = join(root, 'icons', 'icon-source.svg')
const iconsDir = join(root, 'src-tauri', 'icons')
const masterPng = join(iconsDir, 'icon.png')

mkdirSync(iconsDir, { recursive: true })

if (!existsSync(svgPath)) {
  console.error('[gen-icons] icons/icon-source.svg missing')
  process.exit(1)
}

// Load sharp lazily so the dev who only needs the web build isn't forced to install it.
let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('[gen-icons] sharp is not installed. Run: npm install --save-dev sharp')
  process.exit(1)
}

const svgBuf = readFileSync(svgPath)

console.log('[gen-icons] rasterizing master 1024×1024 PNG')
await sharp(svgBuf).resize(1024, 1024).png().toFile(masterPng)

// Sizes Tauri's bundler references in tauri.conf.json
const sizes = [
  { file: '32x32.png',       w: 32 },
  { file: '128x128.png',     w: 128 },
  { file: '128x128@2x.png',  w: 256 },
]
for (const s of sizes) {
  await sharp(svgBuf).resize(s.w, s.w).png().toFile(join(iconsDir, s.file))
  console.log(`[gen-icons]   ${s.file}`)
}

console.log('[gen-icons] running `tauri icon` to produce .icns / .ico')
const res = spawnSync('npx', ['--yes', 'tauri', 'icon', masterPng], {
  cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
})
if (res.status !== 0) {
  console.error('[gen-icons] tauri icon command failed — make sure @tauri-apps/cli is installed')
  process.exit(res.status ?? 1)
}

console.log('[gen-icons] done')
