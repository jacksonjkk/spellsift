import { describe, it, expect } from 'vitest';
import { formatTime } from './time';

describe('formatTime', () => {
  it('formats seconds as minutes and padded seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(125)).toBe('2:05');
  });

  it('floors fractional seconds and never renders negatives', () => {
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(-4)).toBe('0:00');
  });
});
