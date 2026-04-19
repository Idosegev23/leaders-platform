import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as fs from 'fs'
import * as path from 'path'

// One-time setup to upload logos to Supabase Storage
export async function GET() {
  try {
    const supabase = await createClient()
    
    const publicDir = path.join(process.cwd(), 'public')
    const logos = [
      { file: 'logoblack.png', name: 'leaders-logo-black.png' },
      { file: 'logo.png', name: 'leaders-logo-white.png' },
    ]
    
    const results = []
    
    for (const logo of logos) {
      const filePath = path.join(publicDir, logo.file)
      
      if (!fs.existsSync(filePath)) {
        results.push({ name: logo.name, error: 'File not found' })
        continue
      }
      
      const fileBuffer = fs.readFileSync(filePath)
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(`logos/${logo.name}`, fileBuffer, {
          contentType: 'image/png',
          upsert: true,
        })
      
      if (uploadError) {
        results.push({ name: logo.name, error: uploadError.message })
        continue
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(`logos/${logo.name}`)
      
      results.push({ name: logo.name, url: urlData.publicUrl })
    }
    
    return NextResponse.json({ 
      success: true, 
      logos: results,
      message: 'Use these URLs in the template'
    })
  } catch (error) {
    console.error('Setup logos error:', error)
    return NextResponse.json({ error: 'Failed to setup logos' }, { status: 500 })
  }
}




