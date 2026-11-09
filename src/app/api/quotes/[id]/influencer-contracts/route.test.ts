/**
 * Regression: this route uses the service role and returns signing tokens.
 * It must refuse anonymous callers before touching the database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }))
const getAuthenticatedUser = vi.fn()
vi.mock('@/lib/auth/api-auth', () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }))
vi.mock('@/lib/google-drive/client', () => ({ uploadBufferToDriveFolder: vi.fn() }))
vi.mock('@/lib/google-drive/client-folders', () => ({ DRIVE_ANCHORS: {} }))
vi.mock('@/lib/influencer-contract/deck', () => ({ resolveDeckInfluencers: vi.fn() }))
vi.mock('@/lib/influencer-contract/generate', () => ({ buildInfluencerContractData: vi.fn(), generateInfluencerContractPdf: vi.fn() }))

import { GET, POST } from './route'

const params = { params: Promise.resolve({ id: 'quote-1' }) }

describe('influencer-contracts route auth', () => {
  beforeEach(() => {
    createClient.mockReset()
    getAuthenticatedUser.mockReset()
  })

  it('GET without a session → 401 and no service-role query', async () => {
    getAuthenticatedUser.mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/quotes/quote-1/influencer-contracts'), params)
    expect(res.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('POST without a session → 401 and no service-role query', async () => {
    getAuthenticatedUser.mockResolvedValue(null)
    const res = await POST(new Request('http://x', { method: 'POST', body: '{}' }), params)
    expect(res.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('GET with a session reaches the database', async () => {
    getAuthenticatedUser.mockResolvedValue({ id: 'u1', email: 'a@ldrsgroup.com' })
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    createClient.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ order }) }) }) })
    const res = await GET(new Request('http://x'), params)
    expect(res.status).toBe(200)
    expect(createClient).toHaveBeenCalledOnce()
  })
})
