import OpenAI from 'openai'
import { writeFileSync } from 'fs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const prompt = `You are a RECKLESS, AWARD-WINNING art director. You HATE templates. GO WILD.

Design 6 slides for Toyota Israel pitch deck.

Compositions: hero-center, hero-bottom, hero-left, split-image-left, split-image-right, split-diagonal, big-number-center, big-number-side, data-grid-2, data-grid-3, data-grid-4, editorial-stack, editorial-sidebar, quote-center, full-bleed-image, image-showcase, timeline-horizontal, process-3-step, closing-cta, closing-minimal

Sizes: hero|headline|title|subtitle|body|caption|micro
Colors: primary|secondary|accent|on-dark|on-light|muted
Backgrounds: solid-primary|solid-dark|solid-light|gradient-primary|gradient-dramatic|gradient-subtle|aurora|image-full|image-dimmed
Moods: dramatic|professional|warm|minimal|energetic|elegant

Design system: Primary=#EB0A1E, Secondary=#000000, Accent=#58595B, Bg=#121215, Text=#F5F5F7
Metaphor: Japanese precision meets wind tunnel aerodynamics

Slides:
1. cover: 'טויוטה ישראל — על זה כולם מסכימים' (IMAGE: https://example.com/cover.png)
2. brief: 'מותג של שקט, בשוק של רעש' Body: טויוטה לא צריכה להוכיח כלום. (IMAGE: https://example.com/brand.png)
3. goals: 'שני יעדים. מסר אחד ברור.' Cards: חיזוק מעמד: להפוך בטוח לחכם + דור חדש: לגעת ב-25-40
4. insight: 'כולם רבים על הדרך. לא על הרכב.' Stat: 73% (מחליטים לפי המלצה)
5. bigIdea: 'על זה כולם מסכימים' Body: הקמפיין שהופך הסכמת שקט לכוח (IMAGE: https://example.com/activity.png)
6. closing: 'בואו נהפוך את השקט לבחירה של ישראל' Tagline: Leaders × Toyota

Return JSON: { "slides": [{ "composition", "background", "mood", "elements": [{"type","role","content","size","weight","position","color","imageUrl","imageOpacity"}] }] }
Use null for N/A. Hebrew text.`

async function main() {
  console.log('🚀 GPT-5.4 RAW...')
  const t = Date.now()
  const r = await openai.responses.create({
    model: 'gpt-5.4',
    instructions: 'Reckless art director. Return ONLY valid JSON. Go wild.',
    input: prompt,
    text: { format: { type: 'json_object' } },
  })
  const raw = r.output_text || '{}'
  console.log(`✅ ${((Date.now()-t)/1000).toFixed(1)}s, ${raw.length} chars\n`)

  const parsed = JSON.parse(raw)
  const pretty = JSON.stringify(parsed, null, 2)
  console.log(pretty)

  writeFileSync('/tmp/gpt-raw-output.json', pretty)
  console.log('\n📁 Saved to /tmp/gpt-raw-output.json')
}

main().catch(console.error)
