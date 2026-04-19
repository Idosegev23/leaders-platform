/**
 * Gemini Embeddings — for semantic search over Brand Memory
 *
 * Uses gemini-embedding-2-preview (multimodal, 8192 input tokens, 768 dims default).
 *
 * Why: brand-memory.ts currently does string-match lookup (case-sensitive).
 * "אאודי" won't match "Audi". Embeddings solve this — semantic similarity
 * finds related brands across language, spelling, even concept.
 *
 * Schema (Supabase):
 *   table brand_embeddings (
 *     id text primary key,            -- normalized brand name
 *     brand_name text,
 *     industry text,
 *     embedding vector(768),
 *     metadata jsonb,
 *     created_at timestamptz
 *   )
 *   create index on brand_embeddings using ivfflat (embedding vector_cosine_ops);
 */

import { GoogleGenAI } from '@google/genai'

const MODEL = 'gemini-embedding-2-preview'
const DIMS = 768

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
  }
  return _client
}

/**
 * Embed a single text into a 768-dim vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const t0 = Date.now()
  console.log(`[Embeddings] 🔢 Embedding ${text.length} chars (${MODEL}, ${DIMS}d)`)
  const client = getClient()
  const result = await (client.models as any).embedContent({
    model: MODEL,
    contents: text,
    config: { outputDimensionality: DIMS },
  })

  // Different SDK versions return shape differently — handle both
  const embedding =
    result.embedding?.values ||
    result.embeddings?.[0]?.values ||
    result.values ||
    []
  console.log(`[Embeddings] ✅ Got vector(${embedding.length}d) in ${Date.now() - t0}ms`)
  return embedding as number[]
}

/**
 * Embed a brand profile (name + industry + key research) into one vector
 * for semantic recall.
 */
export async function embedBrandProfile(input: {
  brandName: string
  industry?: string
  description?: string
  audience?: string
  values?: string[]
}): Promise<number[]> {
  const text = [
    `Brand: ${input.brandName}`,
    input.industry && `Industry: ${input.industry}`,
    input.description && `Description: ${input.description}`,
    input.audience && `Target audience: ${input.audience}`,
    input.values?.length && `Brand values: ${input.values.join(', ')}`,
  ].filter(Boolean).join('\n')

  return embedText(text)
}

/**
 * Cosine similarity between two vectors.
 * Returns 1 = identical, 0 = unrelated, -1 = opposite.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Dim mismatch: ${a.length} vs ${b.length}`)
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/**
 * Find the top-K most similar brands from a list of stored profiles.
 * Use this when Supabase pgvector isn't set up — pure JS fallback.
 */
export interface StoredBrandEmbedding {
  brandName: string
  embedding: number[]
  metadata?: Record<string, unknown>
}

export async function findSimilarBrands(
  query: string,
  stored: StoredBrandEmbedding[],
  topK: number = 5,
): Promise<Array<StoredBrandEmbedding & { score: number }>> {
  console.log(`[Embeddings] 🔍 findSimilarBrands — query="${query.slice(0, 80)}", searching ${stored.length} brands, topK=${topK}`)
  const queryVec = await embedText(query)
  const ranked = stored
    .map(s => ({ ...s, score: cosineSimilarity(queryVec, s.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
  console.log(`[Embeddings] ✅ Top matches:`)
  ranked.forEach((r, i) => console.log(`[Embeddings]   ${i + 1}. ${r.brandName} (score=${r.score.toFixed(3)})`))
  return ranked
}

/**
 * Embed multiple texts in one batch (for indexing many brands at once).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  // Gemini SDK supports batched embedContent
  const client = getClient()
  const results: number[][] = []
  for (const text of texts) {
    const result = await (client.models as any).embedContent({
      model: MODEL,
      contents: text,
      config: { outputDimensionality: DIMS },
    })
    const embedding =
      result.embedding?.values ||
      result.embeddings?.[0]?.values ||
      result.values ||
      []
    results.push(embedding as number[])
  }
  return results
}

export { DIMS as EMBEDDING_DIMS, MODEL as EMBEDDING_MODEL }
