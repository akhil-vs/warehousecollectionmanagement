import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts', 'shared/**/*.test.ts'],
  },
})
