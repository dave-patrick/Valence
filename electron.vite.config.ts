import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
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
    plugins: [react()],
    resolve: { alias },
    build: {
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
  },
})