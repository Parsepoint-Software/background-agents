/**
 * Extract JSON from agent text output.
 *
 * Agents may return JSON wrapped in markdown code fences, inline with
 * surrounding text, or as raw JSON. This utility handles all cases.
 */

/**
 * Extract the first valid JSON object or array from text.
 *
 * Tries in order:
 * 1. JSON inside ```json ... ``` fences
 * 2. JSON inside ``` ... ``` fences (no language tag)
 * 3. Raw JSON (first { or [ to matching close)
 */
export function extractJson<T = unknown>(text: string): T | null {
  // Try code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Fall through to raw JSON extraction
    }
  }

  // Try raw JSON object
  const objectStart = text.indexOf("{");
  if (objectStart !== -1) {
    const result = extractBalanced(text, objectStart, "{", "}");
    if (result) {
      try {
        return JSON.parse(result) as T;
      } catch {
        // Fall through
      }
    }
  }

  // Try raw JSON array
  const arrayStart = text.indexOf("[");
  if (arrayStart !== -1) {
    const result = extractBalanced(text, arrayStart, "[", "]");
    if (result) {
      try {
        return JSON.parse(result) as T;
      } catch {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Extract a balanced substring between open/close delimiters,
 * accounting for nesting and string literals.
 */
function extractBalanced(text: string, start: number, open: string, close: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}
