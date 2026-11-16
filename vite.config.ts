/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { bench } from './src/bench/plugin'

/**
 * Emit `sw.js` with the list of every built file to keep offline, and a version
 * that changes whenever any of them does (so phones pick up new builds).
 */
function offline(): Plugin {
  return {
    name: 'commonplace-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html')
      const hash = createHash('sha256')
      for (const f of files.sort()) {
        const out = bundle[f]
        hash.update(f).update(out.type === 'chunk' ? out.code : out.source)
      }
      const publicFiles = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'manifest.webmanifest', 'mark.svg']
      const precache = ['./', ...files, ...publicFiles].map((f) => (f === './' ? f : `./${f}`))
      const version = hash.digest('hex').slice(0, 12)
      const source = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(precache))
        .replace('self.__VERSION__', JSON.stringify(version))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// Relative base so the build works at https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  plugins: [react(), offline(), bench()],
})
