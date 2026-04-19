/**
 * Upload base64 images to Supabase Storage and return URLs
 */

import { createClient } from './client'

interface ImageUploadResult {
  coverImage?: string
  brandImage?: string
  audienceImage?: string
  activityImage?: string
  logoUrl?: string
}

/**
 * Check if a string is a base64 data URL
 */
function isBase64Image(str: string | undefined): boolean {
  if (!str) return false
  return str.startsWith('data:image/')
}

/**
 * Convert base64 to blob
 */
function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const mimeMatch = parts[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const data = atob(parts[1])
  const array = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    array[i] = data.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

/**
 * Upload images to Supabase Storage and return public URLs
 * Only uploads base64 images; returns existing URLs as-is
 */
export async function uploadProposalImages(
  images: {
    coverImage?: string
    brandImage?: string
    audienceImage?: string
    activityImage?: string
    logoUrl?: string
  },
  documentId: string
): Promise<ImageUploadResult> {
  const supabase = createClient()
  const result: ImageUploadResult = {}
  
  const uploadTasks: Promise<void>[] = []
  
  // Process each image
  for (const [key, value] of Object.entries(images)) {
    if (!value) continue
    
    // If already a URL, keep it
    if (value.startsWith('http')) {
      result[key as keyof ImageUploadResult] = value
      continue
    }
    
    // If base64, upload it
    if (isBase64Image(value)) {
      const task = (async () => {
        try {
          const blob = base64ToBlob(value)
          const ext = value.includes('jpeg') || value.includes('jpg') ? 'jpg' : 'png'
          const fileName = `proposals/${documentId}/${key}_${Date.now()}.${ext}`
          
          const { error } = await supabase.storage
            .from('assets')
            .upload(fileName, blob, {
              contentType: blob.type,
              upsert: true,
            })
          
          if (error) {
            console.error(`[Upload] Failed to upload ${key}:`, error)
            return
          }
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('assets')
            .getPublicUrl(fileName)
          
          result[key as keyof ImageUploadResult] = urlData.publicUrl
          console.log(`[Upload] Uploaded ${key} -> ${urlData.publicUrl}`)
        } catch (err) {
          console.error(`[Upload] Error uploading ${key}:`, err)
        }
      })()
      
      uploadTasks.push(task)
    }
  }
  
  // Wait for all uploads
  await Promise.all(uploadTasks)
  
  return result
}

/**
 * Upload scraped assets to storage
 */
export async function uploadScrapedAssets(
  scraped: {
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  },
  documentId: string
): Promise<{
  logoUrl?: string
  screenshot?: string
  heroImages?: string[]
  lifestyleImages?: string[]
}> {
  const supabase = createClient()
  const result: {
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    lifestyleImages?: string[]
  } = {}
  
  // Upload logo
  if (scraped.logoUrl) {
    if (scraped.logoUrl.startsWith('http')) {
      result.logoUrl = scraped.logoUrl
    } else if (isBase64Image(scraped.logoUrl)) {
      try {
        const blob = base64ToBlob(scraped.logoUrl)
        const fileName = `proposals/${documentId}/logo_${Date.now()}.png`
        
        const { error } = await supabase.storage
          .from('assets')
          .upload(fileName, blob, { contentType: blob.type, upsert: true })
        
        if (!error) {
          const { data } = supabase.storage.from('assets').getPublicUrl(fileName)
          result.logoUrl = data.publicUrl
        }
      } catch (err) {
        console.error('[Upload] Logo error:', err)
      }
    }
  }
  
  // Upload hero images (first 2 only to save space)
  if (scraped.heroImages?.length) {
    result.heroImages = []
    for (let i = 0; i < Math.min(scraped.heroImages.length, 2); i++) {
      const img = scraped.heroImages[i]
      if (img.startsWith('http')) {
        result.heroImages.push(img)
      } else if (isBase64Image(img)) {
        try {
          const blob = base64ToBlob(img)
          const fileName = `proposals/${documentId}/hero_${i}_${Date.now()}.jpg`
          
          const { error } = await supabase.storage
            .from('assets')
            .upload(fileName, blob, { contentType: blob.type, upsert: true })
          
          if (!error) {
            const { data } = supabase.storage.from('assets').getPublicUrl(fileName)
            result.heroImages.push(data.publicUrl)
          }
        } catch (err) {
          console.error('[Upload] Hero image error:', err)
        }
      }
    }
  }
  
  // Upload lifestyle images (first 2 only)
  if (scraped.lifestyleImages?.length) {
    result.lifestyleImages = []
    for (let i = 0; i < Math.min(scraped.lifestyleImages.length, 2); i++) {
      const img = scraped.lifestyleImages[i]
      if (img.startsWith('http')) {
        result.lifestyleImages.push(img)
      } else if (isBase64Image(img)) {
        try {
          const blob = base64ToBlob(img)
          const fileName = `proposals/${documentId}/lifestyle_${i}_${Date.now()}.jpg`
          
          const { error } = await supabase.storage
            .from('assets')
            .upload(fileName, blob, { contentType: blob.type, upsert: true })
          
          if (!error) {
            const { data } = supabase.storage.from('assets').getPublicUrl(fileName)
            result.lifestyleImages.push(data.publicUrl)
          }
        } catch (err) {
          console.error('[Upload] Lifestyle image error:', err)
        }
      }
    }
  }
  
  return result
}


