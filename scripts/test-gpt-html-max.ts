import OpenAI from 'openai'
import { writeFileSync } from 'fs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const prompt = `You are the BEST web designer alive. You build visual experiences that make people's jaws drop.

BUILD 6 PRESENTATION SLIDES as a single HTML document. Each slide is 1920×1080px.

YOUR CSS ARSENAL — use ALL of these techniques across the deck:
- Mesh gradients (multiple radial-gradient layers)
- Glassmorphism (backdrop-filter: blur + semi-transparent backgrounds + subtle borders)
- -webkit-text-stroke for hollow/outline typography
- mix-blend-mode: overlay, screen, multiply, difference
- clip-path for creative shapes (polygons, circles, custom paths)
- CSS text-shadow with multiple layers (glow effects, 3D depth)
- box-shadow with extreme spread for soft glows (0 0 200px rgba(...))
- CSS transforms: perspective, rotateX/Y for subtle 3D tilts on cards
- Conic-gradient for radial sweep backgrounds
- Opacity layering (watermark text at 0.03-0.08 opacity, 200-400px font size)
- border-image with gradients for neon card borders
- CSS filter: blur, brightness, contrast, saturate on images
- Animated gradient borders (even static snapshots of @keyframes look good)
- letter-spacing from -8px (compressed headlines) to 20px (sparse labels)
- line-height extremes: 0.85 for packed headlines, 2.0 for airy body text

DESIGN SYSTEM:
- Brand: Toyota Israel (טויוטה ישראל)
- Primary: #EB0A1E (bold red — use for power moments)
- Secondary: #000000 (pure black — structural)
- Dark bg: #0C0C10 (rich dark, not flat black)
- Light text: #F5F5F7
- Muted: rgba(245,245,247,0.5)
- Font: 'Heebo', sans-serif (Hebrew)
- Direction: RTL
- Creative metaphor: "Japanese precision engineering meets wind tunnel aerodynamics"

IMAGES (use these exact URLs):
- Car hero: https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=1920&h=1080&fit=crop
- Road: https://images.unsplash.com/photo-1605559424843-9e4c228bf1c6?w=1920&h=1080&fit=crop

THE 6 SLIDES:

SLIDE 1 — COVER (Magazine cover energy)
"טויוטה ישראל — על זה כולם מסכימים"
Subtitle: "הצעת קריאטיב"
Use the car image. Make the title MASSIVE. Use text-stroke for the brand name. Add a subtle red glow.

SLIDE 2 — BRIEF (Editorial split)
"מותג של שקט, בשוק של רעש"
Body: "טויוטה לא צריכה להוכיח כלום. היא צריכה לתזכר למה בחרו בה."
Use the road image on one side. Glassmorphic text panel on the other. Red accent line.

SLIDE 3 — GOALS (Glassmorphism cards)
"שני יעדים. מסר אחד ברור."
Card 1: "חיזוק מעמד — להפוך את הבחירה הבטוחה לבחירה החכמה"
Card 2: "דור חדש — לגעת ב-25-40 בלי לאבד את 40-55"
Make cards with glass effect, gradient borders, perspective tilt.

SLIDE 4 — INSIGHT (Number dominates everything)
The number "73%" should be at least 300px font. Everything else is tiny.
"כולם רבים על הדרך. לא על הרכב."
"של הקונים מחליטים לפי המלצה, לא פרסום"
Aurora/mesh gradient background. The number has a red glow.

SLIDE 5 — BIG IDEA (Typography as art)
"על זה כולם מסכימים"
This slide is PURE TYPOGRAPHY. No images. The text IS the visual.
Use watermark text at 300px+, hollow stroke. The main title at 80-100px.
Dramatic negative space. Red accent elements.

SLIDE 6 — CLOSING (Powerful exit)
"בואו נהפוך את השקט לבחירה של ישראל"
"Leaders × Toyota"
Minimal. 70% empty space. Red background or red accent. Maximum impact with minimum elements.

REQUIREMENTS:
- Single HTML file with embedded <style>
- Google Fonts: Heebo (all weights)
- Each slide: div.slide { width:1920px; height:1080px; position:relative; overflow:hidden; page-break-after:always; }
- All text in Hebrew, RTL
- NO JavaScript. Pure HTML+CSS.
- Make it so beautiful that a creative director would print it and hang it on their wall.`

async function main() {
  console.log('🚀 GPT-5.4 → MAXIMUM CSS POWER...\n')
  const t = Date.now()
  const r = await openai.responses.create({
    model: 'gpt-5.4',
    instructions: 'You are a legendary web designer. Return ONLY a complete, valid HTML document. No markdown, no code fences, no explanation. Start with <!DOCTYPE html> and end with </html>. Make it the most beautiful presentation anyone has ever seen.',
    input: prompt,
  })
  const html = r.output_text || ''
  console.log(`✅ ${((Date.now()-t)/1000).toFixed(1)}s, ${html.length} chars`)

  // Clean up if GPT wrapped in code fences
  let clean = html
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```html?\n?/, '').replace(/\n?```$/, '')
  }

  const outputPath = '/tmp/gpt-slides-max.html'
  writeFileSync(outputPath, clean)
  console.log(`📁 ${outputPath}`)
  console.log(`🌐 Open: file://${outputPath}`)
}

main().catch(console.error)
