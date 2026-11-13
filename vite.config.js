import { defineConfig } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Local debugging only: POST /__shot?name=x (a JPEG data URL as the body) saves
// a canvas capture to .shots/x.jpg, so frames can be inspected even when no
// browser window is visible. Exists on the dev/preview servers, never in dist/.
function debugShots() {
  const handler = (req, res, next) => {
    if (!req.url.startsWith('/__shot') || req.method !== 'POST') return next()
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'shot').replace(/[^\w-]/g, '')
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const dir = join(process.cwd(), '.shots')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name}.jpg`), Buffer.from(body.replace(/^data:image\/\w+;base64,/, ''), 'base64'))
      res.end('ok')
    })
  }
  return {
    name: 'debug-shots',
    configureServer(s) {
      s.middlewares.use(handler)
    },
    configurePreviewServer(s) {
      s.middlewares.use(handler)
    },
  }
}

// Relative asset paths so the zipped dist/ runs from any Bloxity host path.
// es2022 for top-level await in main.js (Rapier's wasm init).
export default defineConfig({
  base: './',
  plugins: [debugShots()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 }, // rapier3d-compat inlines its wasm
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
})
