import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // DB-backed campaigns tests run separately: npm run test:campaigns
    exclude: ['**/node_modules/**', 'src/**/*.int.test.ts'],
  },
})
