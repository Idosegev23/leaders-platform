import { cleanInfluencerName } from '@/lib/brand/rehost-image'
const cases = [
  'Danielle Amit', 'Efrat Lichtenstadt', 'Oz Telem 🥦 עז תלם',
  'Gil Harel | גיל הראל | דקירה קטנה', 'Kobi Edri',
  'Artist | Blogger 🎗️\nמתכונים וטיולים', 'רוני יוחננוב ✨ מתכונים',
]
for (const c of cases) console.log(JSON.stringify(c.slice(0,30)).padEnd(34), '→', JSON.stringify(cleanInfluencerName(c)))
