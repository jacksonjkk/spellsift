import { api } from './api';

// Server-validated word cache. The server dictionary is the source of truth;
// this cache only avoids repeat RPCs while a player types.
const cache = new Map<string, boolean>();

export async function checkWords(words: string[]): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const unique = Array.from(
    new Set(
      words
        .map((word) => word.trim().toUpperCase())
        .filter((word) => word.length > 0)
    )
  );

  const toCheck: string[] = [];
  for (const word of unique) {
    if (cache.has(word)) {
      results.set(word, cache.get(word) === true);
    } else {
      toCheck.push(word);
    }
  }

  if (toCheck.length === 0) return results;

  const invalid = await api.checkWords(toCheck);
  const invalidSet = new Set(invalid.map((word) => word.trim().toUpperCase()));

  for (const word of toCheck) {
    const isValid = !invalidSet.has(word);
    cache.set(word, isValid);
    results.set(word, isValid);
  }

  return results;
}

export function clearDictionaryCache(): void {
  cache.clear();
}
