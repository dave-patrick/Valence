import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const alias = {
  '@core': resolve('src/core'),
  '@platform': resolve('src/platform/index.ts'),
  '@shared': resolve('src/shared'),
  '@ui': resolve('src/ui'),
  '@features': resolve('src/features'),
  '@': resolve('src/renderer/src'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: resolve('src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { rollupOptions: { input: resolve('src/preload/index.ts') } },
  },
  renderer: {
    root: resolve('src/renderer'),
    // Tailwind has to run here as well as in the dev server, or the packaged build ships
    // with every utility class missing while dev looks fine.
    plugins: [react(), tailwindcss()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
  },
})