// gen-icons.mjs
//
// Rasterizes every SVG in icons/ to the PNGs Tauri's bundler expects, then
// calls `tauri icon` to produce the platform .icns / .ico.
//
// Outputs:
//   src-tauri/icons/icon.png              — master 1024×1024 used by tauri icon
//   src-tauri/icons/32x32.png             — bundle icon ref'd in tauri.conf.json
//   src-tauri/icons/128x128.png           — bundle icon ref'd in tauri.conf.json
//   src-tauri/icons/128x128@2x.png        — bundle icon ref'd in tauri.conf.json
//   src-tauri/icons/installer-banner.png  — WiX top banner (493×58)
//   src-tauri/icons/installer-dialog.png  — WiX welcome/finish dialog (493×312)
//   src-tauri/icons/nsis-header.png       — NSIS top header (150×57)
//   src-tauri/icons/nsis-sidebar.png      — NSIS welcome/finish sidebar (164×314)
//   src-tauri/icons/dmg-background.png    — macOS DMG drag-to-Applications backdrop
//   icons/readme-hero.png                 — README banner (1280×320)

import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcIcons = join(root, 'icons')
const tauriIcons = join(root, 'src-tauri', 'icons')

mkdirSync(tauriIcons, { recursive: true })

let sharp
try { sharp = (await import('sharp')).default }
catch {
  console.error('[gen-icons] sharp is not installed. Run: npm install --save-dev sharp')
  process.exit(1)
}

async function rasterize(svgPath, outPath, width, height) {
  if (!existsSync(svgPath)) {
    console.warn(`[gen-icons]   skip (no source): ${svgPath}`)
    return
  }
  const buf = readFileSync(svgPath)
  await sharp(buf, { density: 384 })  // hi-dpi rasterization for crisp output
    .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
  console.log(`[gen-icons]   ${outPath.replace(root + '/', '')}  (${width}×${height})`)
}

console.log('[gen-icons] 1/3 — app icons')
const appSvg = join(srcIcons, 'icon-source.svg')
const masterPng = join(tauriIcons, 'icon.png')
await rasterize(appSvg, masterPng, 1024, 1024)
await rasterize(appSvg, join(tauriIcons, '32x32.png'), 32, 32)
await rasterize(appSvg, join(tauriIcons, '128x128.png'), 128, 128)
await rasterize(appSvg, join(tauriIcons, '128x128@2x.png'), 256, 256)

console.log('[gen-icons] 2/3 — installer artwork')
await rasterize(join(srcIcons, 'installer-banner.svg'),       join(tauriIcons, 'installer-banner.png'),       493, 58)
await rasterize(join(srcIcons, 'installer-dialog.svg'),       join(tauriIcons, 'installer-dialog.png'),       493, 312)
await rasterize(join(srcIcons, 'installer-nsis-header.svg'),  join(tauriIcons, 'nsis-header.png'),            150, 57)
await rasterize(join(srcIcons, 'installer-nsis-sidebar.svg'), join(tauriIcons, 'nsis-sidebar.png'),           164, 314)
await rasterize(join(srcIcons, 'dmg-background.svg'),         join(tauriIcons, 'dmg-background.png'),         540, 380)
// @2x DMG background for retina displays
await rasterize(join(srcIcons, 'dmg-background.svg'),         join(tauriIcons, 'dmg-background@2x.png'),     1080, 760)

console.log('[gen-icons] 3/3 — README hero (committed to repo for GitHub display)')
await rasterize(join(srcIcons, 'readme-hero.svg'), join(srcIcons, 'readme-hero.png'), 1280, 320)

// Tauri's `icon` subcommand generates the platform-specific .icns and .ico
// from the 1024 master. It also produces Windows store assets.
console.log('[gen-icons] running `tauri icon` (.icns + .ico)')
const res = spawnSync('npx', ['--yes', 'tauri', 'icon', masterPng], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (res.status !== 0) {
  console.warn('[gen-icons] tauri icon failed — .icns / .ico will be missing.')
  console.warn('             The build can still produce installers but the executable')
  console.warn('             icon will be Tauri default. Install @tauri-apps/cli and retry.')
}

console.log('[gen-icons] done')
