import { describe, it, expect, beforeAll } from 'vitest'
import { isAllowedImageUrl } from './presentation-agent'

/**
 * The provenance gate exists because of a real deck: the agent ignored the
 * prompt's imagery rules, never called generate_brand_image, and pasted
 * invented stock URLs onto all 17 slides — one of which 404'd. Nothing in the
 * code checked where a slide image came from. These tests pin that check.
 */

const SUPABASE = 'https://fhgggqnaplshwbrzgima.supabase.co'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE
  process.env.NEXT_PUBLIC_APP_URL = 'https://leaders-platform.vercel.app'
})

const NONE = new Set<string>()

describe('isAllowedImageUrl — rejects foreign imagery', () => {
  it('rejects the stock URLs that caused the incident', () => {
    expect(isAllowedImageUrl('https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=1920', NONE)).toBe(false)
    expect(isAllowedImageUrl('https://images.pexels.com/photos/1234/x.jpg', NONE)).toBe(false)
  })

  it('rejects any other open-web host', () => {
    expect(isAllowedImageUrl('https://cdn.shopify.com/x.png', NONE)).toBe(false)
    expect(isAllowedImageUrl('https://en.wikipedia.org/logo.png', NONE)).toBe(false)
    expect(isAllowedImageUrl('http://evil.example/pic.jpg', NONE)).toBe(false)
  })

  it('rejects a URL it cannot parse rather than letting it through', () => {
    expect(isAllowedImageUrl('not a url at all', NONE)).toBe(false)
    expect(isAllowedImageUrl('httpss://broken', NONE)).toBe(false)
  })

  it('does not let a lookalike host sneak past the deployment pattern', () => {
    expect(isAllowedImageUrl('https://leaders-platform.vercel.app.evil.com/x.png', NONE)).toBe(false)
    expect(isAllowedImageUrl('https://notleaders-platform.vercel.app/x.png', NONE)).toBe(false)
  })
})

describe('isAllowedImageUrl — allows what we actually produced', () => {
  it('allows generated scenes and re-hosted photos in our storage', () => {
    expect(isAllowedImageUrl(`${SUPABASE}/storage/v1/object/public/assets/brand/seacretspa/logo.png`, NONE)).toBe(true)
    expect(isAllowedImageUrl(`${SUPABASE}/storage/v1/object/public/assets/influencers/someone.jpg`, NONE)).toBe(true)
  })

  it('allows assets served by the app itself', () => {
    expect(isAllowedImageUrl('https://leaders-platform.vercel.app/new_logo.svg', NONE)).toBe(true)
    expect(isAllowedImageUrl('/new_logo.svg', NONE)).toBe(true)
    expect(isAllowedImageUrl('data:image/png;base64,iVBORw0KGgo=', NONE)).toBe(true)
  })

  it('allows a preview deployment of this app', () => {
    expect(isAllowedImageUrl('https://leaders-platform-k5kuqk0cy-idosegev23s-projects.vercel.app/x.png', NONE)).toBe(true)
  })

  it('allows an explicitly-offered URL even when hosted elsewhere', () => {
    const offered = 'https://scenes.example.com/prepared-scene-1.png'
    expect(isAllowedImageUrl(offered, new Set([offered]))).toBe(true)
    expect(isAllowedImageUrl('https://scenes.example.com/other.png', new Set([offered]))).toBe(false)
  })

  it('treats "no image" as fine — the gate is about foreign images, not missing ones', () => {
    expect(isAllowedImageUrl('', NONE)).toBe(true)
    expect(isAllowedImageUrl('   ', NONE)).toBe(true)
  })
})
