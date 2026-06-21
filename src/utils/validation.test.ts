import { describe, it, expect } from 'vitest';
import { validateWord } from './validation';

describe('validateWord', () => {
  const baseWord = 'ANTIGRAVITY';

  it('rejects empty words', () => {
    const res = validateWord('', baseWord, []);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('cannot be empty');
  });

  it('rejects word matching base word', () => {
    const res = validateWord('ANTIGRAVITY', baseWord, []);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('original base word');
  });

  it('accepts correct sub-words with letters from base word', () => {
    const res1 = validateWord('TINY', baseWord, []);
    expect(res1.isValid).toBe(true);

    const res2 = validateWord('GIANT', baseWord, []);
    expect(res2.isValid).toBe(true);

    // Letter reuse is allowed in SpellSift!
    const res3 = validateWord('GRAVITY', baseWord, []);
    expect(res3.isValid).toBe(true);
  });

  it('rejects words with letters not in base word', () => {
    const res = validateWord('BOATS', baseWord, []);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('is not available in the base word');
  });

  it('rejects duplicate words', () => {
    const existing = ['TINY', 'GIANT'];
    const res = validateWord('TINY', baseWord, existing);
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('already submitted');
  });
});
