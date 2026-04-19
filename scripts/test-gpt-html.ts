import OpenAI from 'openai'
import { writeFileSync } from 'fs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const prompt = `You are a RECKLESS, AWARD-WINNING art director who builds STUNNING presentation slides in pure HTML+CSS.

Each slide is a 1920×1080px div. You have COMPLETE creative freedom with CSS — gradients, shadows, blur, clip-path, mix-blend-mode, text-stroke, transforms, overlays, glassmorphism, everything.

Design system:
- Brand: Toyota Israel (טויוטה ישראל)
- Primary: #EB0A1E (bold red)
- Secondary: #000000
- Accent: #58595B
- Background: #121215
- Text: #F5F5F7
- Font: 'Heebo', sans-serif
- Direction: RTL
- Metaphor: "Japanese precision engineering meets wind tunnel aerodynamics"
- Visual tension: "Static heavy industrial carbon vs streaks of kinetic red light"

RULES:
1. Each slide is a <div> with exactly width:1920px; height:1080px; position:relative; overflow:hidden;
2. ALL text in Hebrew. RTL direction.
3. Use ONLY these image URLs (don't invent):
   - https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=1920&h=1080&fit=crop (Toyota car)
   - https://images.unsplash.com/photo-1605559424843-9e4c228bf1c6?w=1920&h=1080&fit=crop (road)
4. Go WILD with CSS. Watermarks at 300px+, bleeding elements, dramatic gradients, glassmorphism cards, text-stroke hollow titles, radial glows.
5. Every slide should look like a magazine cover, not a PowerPoint.
6. Some slides should be 80% empty space. Others should be dense with overlapping cards.

Design 6 slides:
1. COVER — "טויוטה ישראל — על זה כולם מסכימים" with the car image
2. BRIEF — "מותג של שקט, בשוק של רעש" with road image
3. GOALS — "שני יעדים. מסר אחד ברור." Two glass cards
4. INSIGHT — "73%" massive stat with "כולם רבים על הדרך. לא על הרכב."
5. BIG IDEA — "על זה כולם מסכימים" dramatic typography
6. CLOSING — "בואו נהפוך את השקט לבחירה של ישראל" + "Leaders × Toyota"

Return a SINGLE HTML document. Include a <style> block with all CSS. Each slide is a div.slide with page-break-after.
Include Google Fonts link for Heebo.
Make it BREATHTAKING.`

async function main() {
  console.log('🚀 GPT-5.4 → Pure HTML/CSS slides...\n')
  const t = Date.now()
  const r = await openai.responses.create({
    model: 'gpt-5.4',
    instructions: 'You are a world-class web designer. Return ONLY a complete HTML document. No markdown fences. No explanation. Just raw HTML.',
    input: prompt,
  })
  const html = r.output_text || ''
  console.log(`✅ ${((Date.now()-t)/1000).toFixed(1)}s, ${html.length} chars\n`)

  // Save to file
  const outputPath = '/tmp/gpt-slides.html'
  writeFileSync(outputPath, html)
  console.log(`📁 Saved to ${outputPath}`)
  console.log(`🌐 Open in browser: file://${outputPath}`)

  // Show first 200 chars
  console.log(`\n--- Preview ---\n${html.slice(0, 500)}...`)
}

main().catch(console.error)
