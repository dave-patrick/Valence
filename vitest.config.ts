import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
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
  test: {
    include: ['test/**/*.test.ts'],
    // The core suites are pure and need no DOM; the smoke test opts into jsdom with a
    // `@vitest-environment` docblock, so the environment is set per-file rather than globally.
    environment: 'node',
  },
})