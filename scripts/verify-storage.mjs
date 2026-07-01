// Run: node -r dotenv/config scripts/verify-storage.mjs dotenv_config_path=.env.local
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const path = `decks/_verify/${Date.now()}.txt`
const body = Buffer.from('hello-' + Date.now())
const up = await sb.storage.from('documents').upload(path, body, { contentType: 'text/plain', upsert: true })
if (up.error) { console.error('UPLOAD FAIL', up.error.message); process.exit(1) }
const sign = await sb.storage.from('documents').createSignedUrl(path, 600)
if (sign.error || !sign.data?.signedUrl) { console.error('SIGN FAIL', sign.error?.message); process.exit(1) }
const got = await fetch(sign.data.signedUrl).then(r => r.text())
if (got !== body.toString()) { console.error('ROUNDTRIP MISMATCH', got); process.exit(1) }
await sb.storage.from('documents').remove([path])
console.log('OK: upload + signed URL round-trip')
