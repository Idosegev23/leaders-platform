import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Campaigns module integration tests against a real local Postgres.
// CAMPAIGNS_TEST_DATABASE_URL must point at localhost (default below); the
// database is dropped and rebuilt from supabase/migrations on every run.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['src/lib/campaigns/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
