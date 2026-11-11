import { describe, it, expect } from 'vitest';
import { ApiError, isNoRowsError, toUserMessage } from './errors';

describe('error helpers', () => {
  it('returns a fallback for empty values', () => {
    expect(toUserMessage(null, 'Fallback')).toBe('Fallback');
    expect(toUserMessage(undefined, 'Fallback')).toBe('Fallback');
    expect(toUserMessage({}, 'Fallback')).toBe('Fallback');
  });

  it('prefers explicit ApiError messages', () => {
    expect(toUserMessage(new ApiError('Room is full.'), 'Fallback')).toBe('Room is full.');
  });

  it('maps common Postgres and PostgREST codes', () => {
    expect(toUserMessage({ code: '23505', message: 'duplicate key' })).toBe(
      'That value is already taken.'
    );
    expect(toUserMessage({ code: '42501', message: 'permission denied' })).toBe(
      'You do not have permission to do that.'
    );
    expect(toUserMessage({ code: 'PGRST301', message: 'jwt expired' })).toBe(
      'Your session has expired. Please sign in again.'
    );
  });

  it('shows intentional RPC messages', () => {
    expect(toUserMessage({ code: 'P0001', message: 'This room is full.' })).toBe(
      'This room is full.'
    );
  });

  it('maps auth error codes', () => {
    expect(toUserMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Invalid email or password.'
    );
    expect(toUserMessage({ code: 'email_not_confirmed', message: 'Email not confirmed' })).toBe(
      'Please confirm your email before signing in.'
    );
  });

  it('maps network failures', () => {
    expect(toUserMessage({ message: 'Failed to fetch' })).toBe(
      'Network error. Check your connection and try again.'
    );
  });

  it('does not expose unknown server internals', () => {
    expect(toUserMessage({ message: 'relation "profiles" does not exist' }, 'Fallback')).toBe(
      'Fallback'
    );
    expect(toUserMessage({ message: 'Custom failure' }, 'Fallback')).toBe('Fallback');
  });

  it('detects no-rows errors', () => {
    expect(isNoRowsError({ code: 'PGRST116' })).toBe(true);
    expect(isNoRowsError({ code: '23505' })).toBe(false);
    expect(isNoRowsError(null)).toBe(false);
  });
});
