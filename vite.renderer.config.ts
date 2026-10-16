import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Renderer-only dev server.
 *
 * Serves the editor in a plain browser, backed by the in-memory platform implementation
 * (src/platform/web.ts). This is how the UI is iterated on without booting Electron, and it
 * doubles as proof that the core needs no shell to function.
 *
 * The house fonts (Source Sans 3, IBM Plex Mono, Chakra Petch) come from the stylesheet link
 * in index.html, matching Quantos' families and weights.
 *
 * The Tailwind plugin is not optional. `@import 'tailwindcss'` is inert without it — the
 * package on its own only ships the engine's entry CSS, so every utility class in the JSX
 * silently becomes a no-op and the layout collapses into unstyled block flow.
 */
export default defineConfig({
  root: resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': resolve(import.meta.dirname, 'src/core'),
      '@platform': resolve(import.meta.dirname, 'src/platform/index.ts'),
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@ui': resolve(import.meta.dirname, 'src/ui'),
      '@features': resolve(import.meta.dirname, 'src/features'),
      '@': resolve(import.meta.dirname, 'src/renderer/src'),
    },
  },
  server: { port: 5199, strictPort: true },
})