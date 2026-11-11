import { describe, it, expect } from 'vitest';
import {
  normaliseNotepad,
  stripLineNumber,
  parseNotepadWords,
  currentLineWord,
} from './notepad';

describe('notepad helpers', () => {
  it('normalises Windows and old Mac line endings', () => {
    expect(normaliseNotepad('one\r\ntwo\rthree')).toBe('one\ntwo\nthree');
  });

  it('strips generated line numbers', () => {
    expect(stripLineNumber('12. WORD')).toBe('WORD');
    expect(stripLineNumber(' 3.   OTHER  ')).toBe('OTHER');
    expect(stripLineNumber('NO NUMBER')).toBe('NO NUMBER');
  });

  it('parses, upper-cases, and de-duplicates notepad words', () => {
    expect(parseNotepadWords('1. tiny\n2. giant\n\n3. TINY\n4. gravity')).toEqual([
      'TINY',
      'GIANT',
      'GRAVITY',
    ]);
  });

  it('ignores empty and number-only lines', () => {
    expect(parseNotepadWords('1. \n2. \n\n')).toEqual([]);
  });

  it('returns the word on the current line without its number', () => {
    const text = '1. ALPHA\n2. BETA';
    expect(currentLineWord(text, text.length)).toBe('BETA');
    expect(currentLineWord(text, text.indexOf('\n'))).toBe('ALPHA');
  });
});
