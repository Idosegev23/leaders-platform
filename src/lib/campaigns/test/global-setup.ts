import { resetDatabase } from '../../../../scripts/campaigns/db'

export const TEST_DB_URL = process.env.CAMPAIGNS_TEST_DATABASE_URL || 'postgres://postgres@localhost:54329/leaders_test'

export default async function setup() {
  process.env.CAMPAIGNS_TEST_DATABASE_URL = TEST_DB_URL
  await resetDatabase(TEST_DB_URL)
}
