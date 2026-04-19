import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const prompt = `You are a RECKLESS, AWARD-WINNING art director. You HATE templates. You HATE safe choices.

Design 6 slides for Toyota Israel pitch deck. GO WILD. Surprise me.

Available compositions: hero-center, hero-bottom, hero-left, split-image-left, split-image-right, split-diagonal, big-number-center, big-number-side, data-grid-2, data-grid-3, data-grid-4, editorial-stack, editorial-sidebar, quote-center, quote-attributed, full-bleed-image, image-showcase, timeline-horizontal, process-3-step, closing-cta, closing-minimal

Tokens — Sizes: hero|headline|title|subtitle|body|caption|micro. Colors: primary|secondary|accent|on-dark|on-light|muted. Backgrounds: solid-primary|solid-dark|solid-light|gradient-primary|gradient-dramatic|gradient-subtle|aurora|image-full|image-dimmed. Moods: dramatic|professional|warm|minimal|energetic|elegant.

Design system: Primary=#EB0A1E, Secondary=#000000, Accent=#58595B, Bg=#121215, Text=#F5F5F7. Metaphor: Japanese precision meets wind tunnel aerodynamics.

Slides:
1. cover: 'טויוטה ישראל — על זה כולם מסכימים' (IMAGE: https://example.com/cover.png)
2. brief: 'מותג של שקט, בשוק של רעש' (IMAGE: https://example.com/brand.png)
3. goals: 'שני יעדים. מסר אחד ברור.' Cards: חיזוק מעמד + דור חדש
4. insight: 'כולם רבים על הדרך. לא על הרכב.' Stat: 73%
5. bigIdea: 'על זה כולם מסכימים' (IMAGE: https://example.com/activity.png)
6. closing: 'בואו נהפוך את השקט לבחירה של ישראל' Tagline: Leaders × Toyota

Return JSON: { slides: [{ composition, background, mood, elements: [{type, role, content, size, weight, position, color, imageUrl, imageOpacity}] }] }
Use null for N/A fields. Hebrew text only.`

async function main() {
  console.log('🚀 Calling GPT-5.4 RAW — no schema, full freedom...\n')
  const t = Date.now()
  const r = await openai.responses.create({
    model: 'gpt-5.4',
    instructions: 'Reckless art director. Return ONLY valid JSON. Go wild with your choices.',
    input: prompt,
    text: { format: { type: 'json_object' } },
  })
  console.log(`✅ Done in ${((Date.now()-t)/1000).toFixed(1)}s (${(r.output_text||'').length} chars)\n`)

  const parsed = JSON.parse(r.output_text || '{}')
  for (const s of parsed.slides || []) {
    console.log(`🎯 ${(s.composition||'?').padEnd(22)} | ${(s.background||'?').padEnd(18)} | ${(s.mood||'?').padEnd(12)} | ${s.elements?.length || 0} els`)
    for (const e of s.elements || []) {
      const c = e.content ? e.content.slice(0,45) : (e.imageUrl ? '🖼️ '+e.imageUrl.slice(-20) : '◆ shape')
      console.log(`   ${(e.type||'?').padEnd(6)} ${(e.role||'?').padEnd(12)} sz=${String(e.size||'-').padEnd(9)} w=${String(e.weight||'-').padEnd(10)} c=${String(e.color||'-').padEnd(8)} ${c}`)
    }
    console.log('')
  }
}

main().catch(console.error)
