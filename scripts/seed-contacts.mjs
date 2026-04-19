// Seed the `contacts` table from scripts/contacts.csv.
// Run once after applying the hub schema migration.
//
// Usage:
//   node scripts/seed-contacts.mjs
//
// Env vars required (reads from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (NOT the anon key — need service role to bypass RLS)
//
// Safe to re-run: upserts on email.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')

// Minimal .env.local loader so we don't depend on dotenv.
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

const csvPath = path.join(__dirname, 'contacts.csv')
const csv = fs.readFileSync(csvPath, 'utf-8')
const rows = csv.split('\n').slice(1) // skip header

const contacts = rows
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [first_name, last_name, hebrew_first_name, hebrew_last_name, email] = line
      .split(',')
      .map((c) => c?.trim() ?? '')
    return { first_name, last_name, hebrew_first_name, hebrew_last_name, email: email.toLowerCase() }
  })
  .filter((c) => c.email && c.email.includes('@'))

console.log(`Upserting ${contacts.length} contacts...`)

const { error } = await supabase.from('contacts').upsert(contacts, { onConflict: 'email' })

if (error) {
  console.error('Upsert failed:', error.message)
  process.exit(1)
}

console.log('Done.')
