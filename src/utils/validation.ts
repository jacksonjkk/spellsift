export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Client-side pre-validation. The server repeats every rule, so this only
 * exists to give fast feedback while typing.
 *
 * Rules:
 * - 3-25 letters
 * - Not equal to the base word
 * - Uses only letters present in the base word (letters may be reused)
 * - Not already submitted in this round
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

  if (cleanWord.length < 3) {
    return { isValid: false, error: 'Words must be at least 3 letters.' };
  }

  if (cleanWord.length > 25) {
    return { isValid: false, error: 'Words must be 25 letters or fewer.' };
  }

  if (!/^[a-z]+$/.test(cleanWord)) {
    return { isValid: false, error: 'Words can only contain letters.' };
  }

  if (cleanWord === cleanBase) {
    return { isValid: false, error: 'Cannot submit the original base word.' };
  }

  for (const char of cleanWord) {
    if (!cleanBase.includes(char)) {
      return {
        isValid: false,
        error: `Letter "${char.toUpperCase()}" is not available in the base word "${baseWord.toUpperCase()}".`,
      };
    }
  }

  const lowerExisting = existingWords.map((word) => word.trim().toLowerCase());
  if (lowerExisting.includes(cleanWord)) {
    return { isValid: false, error: 'You have already submitted this word.' };
  }

  return { isValid: true };
}
