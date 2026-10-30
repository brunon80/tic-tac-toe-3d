import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // relative asset URLs: the same dist/ works at the Pages subpath, at any root,
  // and straight off disk — no per-host base path needed.
  base: './',
  build: {
    target: 'es2023',
    sourcemap: true,
    // three.js is the bulk of the bundle: keeping it in its own chunk makes repeat deploys
    // cacheable and leaves the app code in a small chunk.
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
