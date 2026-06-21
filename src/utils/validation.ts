export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates whether the submitted word matches the constraints.
 * 
 * Rules:
 * - Not empty
 * - Not equal to base word
 * - Uses only letters present in the base word (reusable unlimited times)
 * - Duplicate submissions by the same player are rejected
 */
export function validateWord(
  submittedWord: string,
  baseWord: string,
  existingWords: string[]
): ValidationResult {
  const cleanWord = submittedWord.trim().toLowerCase();
  const cleanBase = baseWord.trim().toLowerCase();

  if (!cleanWord) {
    return { isValid: false, error: 'Word cannot be empty.' };
  }

  if (cleanWord === cleanBase) {
    return { isValid: false, error: 'Cannot submit the original base word.' };
  }

  // Check that all letters of cleanWord exist in cleanBase
  for (let i = 0; i < cleanWord.length; i++) {
    const char = cleanWord[i];
    // We only allow alphabetical characters. If baseWord doesn't have it, reject.
    if (!cleanBase.includes(char)) {
      return { 
        isValid: false, 
        error: `Letter "${char.toUpperCase()}" is not available in the base word "${baseWord.toUpperCase()}".` 
      };
    }
  }

  // Check duplicates in current session list
  const lowerExisting = existingWords.map(w => w.trim().toLowerCase());
  if (lowerExisting.includes(cleanWord)) {
    return { isValid: false, error: 'You have already submitted this word.' };
  }

  return { isValid: true };
}
