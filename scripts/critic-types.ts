/**
 * Shared types for all critic modules.
 */
export interface CriticResult {
  module: string
  score: number
  passed: number
  failed: number
  warnings: number
  details: { name: string; status: 'pass' | 'fail' | 'warn'; message?: string }[]
}
