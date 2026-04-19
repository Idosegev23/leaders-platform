/**
 * JSON Cleanup Utilities
 * Handles parsing and cleaning JSON responses from AI models
 *
 * Common Gemini issues this handles:
 * - Unescaped double-quotes inside string values (Hebrew content)
 * - Unescaped newlines / tabs inside strings
 * - Trailing commas before } or ]
 * - Markdown code-block wrappers
 * - Truncated JSON (unclosed brackets/braces)
 * - Control characters
 * - Single-line // comments
 */

/**
 * Parse and clean JSON from Gemini/GPT responses.
 * Tries multiple repair strategies before giving up.
 */
export function parseGeminiJson<T>(text: string): T {
  // Step 1: strip markdown wrappers
  let clean = stripMarkdown(text)

  // Step 2: basic structural fixes (trailing commas, control chars)
  clean = basicCleanup(clean)

  // Attempt 1: plain JSON.parse
  const r1 = tryParse<T>(clean)
  if (r1 !== undefined) return r1

  // Attempt 2: extract { … } and try again
  const extracted = extractJsonObject(clean)
  if (extracted) {
    const r2 = tryParse<T>(extracted)
    if (r2 !== undefined) return r2

    // Attempt 3: deep-repair the extracted JSON (fix unescaped quotes etc.)
    const repaired = repairJsonString(extracted)
    const r3 = tryParse<T>(repaired)
    if (r3 !== undefined) return r3

    // Attempt 4: fix truncated JSON
    const fixed = fixTruncatedJson(repaired)
    const r4 = tryParse<T>(fixed)
    if (r4 !== undefined) return r4
  }

  // Attempt 5: extract [ … ] array
  const arrayExtracted = extractJsonArray(clean)
  if (arrayExtracted) {
    const r5 = tryParse<T>(arrayExtracted)
    if (r5 !== undefined) return r5

    const repairedArr = repairJsonString(arrayExtracted)
    const r5b = tryParse<T>(repairedArr)
    if (r5b !== undefined) return r5b
  }

  // Attempt 6: deep repair on entire cleaned text
  const fullRepair = repairJsonString(clean)
  const r6 = tryParse<T>(fullRepair)
  if (r6 !== undefined) return r6

  // Attempt 7: aggressive line-by-line repair
  const aggressive = aggressiveRepair(extracted || clean)
  const r7 = tryParse<T>(aggressive)
  if (r7 !== undefined) return r7

  // Nothing worked – throw a descriptive error
  throw new Error(
    `Failed to parse JSON from AI response (${text.length} chars). ` +
    `First 200 chars: ${text.slice(0, 200)}`
  )
}

// ─── Internals ───────────────────────────────────────────────

function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined
  }
}

/** Strip markdown code-block wrappers */
function stripMarkdown(text: string): string {
  let clean = text.trim()

  // Remove wrapping ```json … ```
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) {
    clean = fenced[1].trim()
  } else {
    // Remove leading/trailing ``` individually
    clean = clean
      .replace(/^```json\s*/gi, '')
      .replace(/^```\s*/gi, '')
      .replace(/```\s*$/gi, '')
      .trim()
  }

  return clean
}

/** Basic structural cleanup */
function basicCleanup(text: string): string {
  return text
    // Remove trailing commas before } or ]
    .replace(/,(\s*[}\]])/g, '$1')
    // Remove control characters except \n \r \t
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // Remove single-line JS comments (// …) that are NOT inside strings
    .replace(/^(\s*)\/\/.*$/gm, '$1')
    // Remove BOM
    .replace(/^\uFEFF/, '')
}

/** Extract the outermost { … } from text */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  const end = text.lastIndexOf('}')
  if (end <= start) return null
  return text.slice(start, end + 1)
}

/** Extract the outermost [ … ] from text */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[')
  if (start === -1) return null
  const end = text.lastIndexOf(']')
  if (end <= start) return null
  return text.slice(start, end + 1)
}

/**
 * Walk through JSON character-by-character and repair:
 * - Unescaped double-quotes inside string values
 * - Unescaped real newlines inside strings
 * - Unescaped backslashes
 * - Trailing commas
 */
function repairJsonString(json: string): string {
  const out: string[] = []
  let i = 0
  const len = json.length
  let inString = false
  let stringStart = -1

  while (i < len) {
    const ch = json[i]

    if (!inString) {
      if (ch === '"') {
        inString = true
        stringStart = i
        out.push(ch)
        i++
        continue
      }
      // Outside strings – pass through
      out.push(ch)
      i++
      continue
    }

    // === Inside a string ===

    // Escaped character – pass through both chars
    if (ch === '\\' && i + 1 < len) {
      const next = json[i + 1]
      // Valid JSON escapes: " \ / b f n r t u
      if ('"\\bfnrtu/'.includes(next)) {
        out.push(ch, next)
        i += 2
        continue
      }
      // Invalid escape – just pass the backslash escaped
      out.push('\\\\')
      i++
      continue
    }

    // Unescaped real newline inside string → escape it
    if (ch === '\n') {
      out.push('\\n')
      i++
      continue
    }
    if (ch === '\r') {
      out.push('\\r')
      i++
      continue
    }
    if (ch === '\t') {
      out.push('\\t')
      i++
      continue
    }

    // A double-quote inside a string: is it the closing quote or an unescaped interior quote?
    if (ch === '"') {
      // Look ahead to determine context
      const after = json.slice(i + 1, i + 80).trimStart()
      const firstAfter = after[0]

      // Definitely the closing quote if we're at end of input
      if (firstAfter === undefined) {
        inString = false
        stringStart = -1
        out.push(ch)
        i++
        continue
      }

      // Closing quote if followed by } or ]
      if (firstAfter === '}' || firstAfter === ']') {
        inString = false
        stringStart = -1
        out.push(ch)
        i++
        continue
      }

      // Closing quote if followed by : (this was a key)
      if (firstAfter === ':') {
        inString = false
        stringStart = -1
        out.push(ch)
        i++
        continue
      }

      // If followed by comma: check what comes AFTER the comma.
      // A structural comma is followed by whitespace + "key": or } or ]
      // A non-structural comma is followed by regular text (Hebrew etc.)
      if (firstAfter === ',') {
        const afterComma = after.slice(1).trimStart()
        if (
          afterComma[0] === '"' || // next key: , "key":
          afterComma[0] === '}' || // end of object: , }
          afterComma[0] === ']' || // end of array: , ]
          afterComma[0] === '{' || // nested object
          afterComma[0] === '['    // nested array
        ) {
          inString = false
          stringStart = -1
          out.push(ch)
          i++
          continue
        }
        // Comma followed by non-structural text (e.g., `טעייה", אבל`) → interior quote
        out.push('\\"')
        i++
        continue
      }

      // Followed by whitespace then "key": pattern
      if (/^,?\s*"[^"]+"\s*:/.test(after)) {
        inString = false
        stringStart = -1
        out.push(ch)
        i++
        continue
      }

      // Otherwise, it's an unescaped interior quote → escape it
      out.push('\\"')
      i++
      continue
    }

    // Regular character inside string
    out.push(ch)
    i++
  }

  // If we ended inside a string, close it
  if (inString) {
    out.push('"')
  }

  let result = out.join('')

  // Final pass: fix trailing commas that may have been exposed
  result = result.replace(/,(\s*[}\]])/g, '$1')

  return result
}

/**
 * Aggressive line-by-line repair: remove lines that break JSON structure
 */
function aggressiveRepair(json: string): string {
  // First try the char-by-char repair
  let repaired = repairJsonString(json)

  // Fix truncation
  repaired = fixTruncatedJson(repaired)

  // Try removing trailing commas more aggressively
  repaired = repaired
    .replace(/,\s*,/g, ',')
    .replace(/\[\s*,/g, '[')
    .replace(/,\s*\]/g, ']')
    .replace(/{\s*,/g, '{')
    .replace(/,\s*}/g, '}')

  return repaired
}

/**
 * Attempt to fix truncated JSON by closing open brackets and quotes
 */
function fixTruncatedJson(json: string): string {
  let fixed = json.trim()

  // Remove trailing incomplete key (quote opened but never closed, e.g., , "tagline)
  fixed = fixed.replace(/,\s*"[^"]*$/, '')

  // Remove trailing key with no value (e.g., , "key": or , "key")
  fixed = fixed.replace(/,\s*"[^"]*"\s*:?\s*$/, '')

  // Remove trailing incomplete string values
  fixed = fixed.replace(/:\s*"[^"]*$/, ': ""')

  // Remove trailing commas
  fixed = fixed.replace(/,\s*$/, '')

  // Count and close brackets
  let openBraces = 0
  let openBrackets = 0
  let inString = false
  let escaped = false

  for (const char of fixed) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') openBraces++
    if (char === '}') openBraces--
    if (char === '[') openBrackets++
    if (char === ']') openBrackets--
  }

  // If we're in a string, close it
  if (inString) {
    fixed += '"'
  }

  // Close open brackets
  while (openBrackets > 0) {
    fixed += ']'
    openBrackets--
  }

  // Close open braces
  while (openBraces > 0) {
    fixed += '}'
    openBraces--
  }

  return fixed
}

// ─── Public Utilities ────────────────────────────────────────

/**
 * Deep stringify any value to a string or string array
 * Handles nested objects and arrays properly
 */
export function deepStringify(value: unknown): string | string[] {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (Array.isArray(value)) {
    return value.map(v => {
      if (typeof v === 'object' && v !== null) {
        // Object inside array - convert to structured text
        return Object.entries(v)
          .filter(([, val]) => val !== null && val !== undefined && val !== '')
          .map(([k, val]) => {
            const strVal = deepStringify(val)
            return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
          })
          .join(', ')
      }
      const result = deepStringify(v)
      return Array.isArray(result) ? result.join(', ') : result
    })
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([k, v]) => {
        const strVal = deepStringify(v)
        return `${k}: ${Array.isArray(strVal) ? strVal.join(', ') : strVal}`
      })
      .join('; ')
  }

  return String(value)
}

/**
 * Safely stringify for display (never returns [object Object])
 */
export function safeStringify(value: unknown): string {
  const result = deepStringify(value)
  return Array.isArray(result) ? result.join(', ') : result
}

/**
 * Convert an array of objects to an array of strings
 */
export function objectArrayToStrings<T extends Record<string, unknown>>(
  arr: T[] | undefined,
  formatter: (item: T) => string
): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.map(item => {
    if (typeof item === 'string') return item
    return formatter(item)
  })
}
