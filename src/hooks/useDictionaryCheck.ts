import { useState, useEffect, useRef } from 'react';
import { checkWords } from '../services/dictionary';
import { parseNotepadWords } from '../utils/notepad';

const EMPTY_INVALID_WORDS = new Set<string>();

export function useDictionaryCheck(notepadText: string, enabled: boolean) {
  const [invalidWords, setInvalidWords] = useState<Set<string>>(EMPTY_INVALID_WORDS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    debounceRef.current = setTimeout(() => {
      const words = parseNotepadWords(notepadText).filter((word) => word.length >= 3);
      if (words.length === 0) {
        setInvalidWords(new Set());
        return;
      }

      void checkWords(words)
        .then((results) => {
          if (requestRef.current !== requestId) return;
          const invalid = new Set<string>();
          results.forEach((isValid, word) => {
            if (!isValid) invalid.add(word);
          });
          setInvalidWords(invalid);
        })
        .catch((error) => {
          // A failed check must not mark every word as invalid.
          console.warn('Dictionary check failed:', error);
        });
    }, 450);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [notepadText, enabled]);

  return { invalidWords: enabled ? invalidWords : EMPTY_INVALID_WORDS };
}
