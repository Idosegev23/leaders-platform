// One-off E2E test: AI mapping bridge on a real document (run with tsx)
//   npx tsx --env-file=.env.local scripts/test-native-deck.ts <documentId>
import { autofillCreativeDeckFromDocument } from '../src/lib/canva/autofill-deck'

const documentId = process.argv[2]
if (!documentId) {
  console.error('usage: npx tsx --env-file=.env.local scripts/test-native-deck.ts <documentId>')
  process.exit(1)
}

autofillCreativeDeckFromDocument(documentId, 'test-native')
  .then((r) => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch((e) => {
    console.error('FAILED:', e)
    process.exit(1)
  })
