export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { code?: string; status?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
  }
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
}

const AUTH_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Please confirm your email before signing in.',
  email_exists: 'An account with that email already exists.',
  user_already_exists: 'An account with that email already exists.',
  weak_password: 'Choose a stronger password (at least 6 characters).',
  same_password: 'Choose a password different from your current one.',
  over_email_send_rate_limit: 'Too many emails were sent. Try again later.',
  over_request_rate_limit: 'Too many requests. Try again later.',
  email_address_invalid: 'Enter a valid email address.',
  signup_disabled: 'Sign-ups are currently disabled.',
  validation_failed: 'Check the form and try again.',
  session_not_found: 'Your session has expired. Please sign in again.',
  refresh_token_not_found: 'Your session has expired. Please sign in again.',
};

export function isNoRowsError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ErrorLike).code === 'PGRST116'
  );
}

export function toUserMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof ApiError) return error.message;

  if (typeof error === 'object' && error !== null) {
    const value = error as ErrorLike;
    const code = typeof value.code === 'string' ? value.code : undefined;
    const message = typeof value.message === 'string' ? value.message : '';

    if (code === 'PGRST116') return 'Not found.';
    if (code === '23505') return 'That value is already taken.';
    if (code === '23503') return 'That item is no longer available.';
    if (code === '42501') return 'You do not have permission to do that.';
    if (code === 'PGRST301' || code === 'PGRST302') {
      return 'Your session has expired. Please sign in again.';
    }

    if (code && AUTH_CODE_MESSAGES[code]) return AUTH_CODE_MESSAGES[code];

    // PL/pgSQL RAISE EXCEPTION uses P0001. Those messages are written for
    // players by our own RPCs, so they are safe to show.
    if (code === 'P0001') return message || fallback;

    if (
      message === 'Failed to fetch' ||
      message === 'Load failed' ||
      message.includes('NetworkError') ||
      message.includes('network error')
    ) {
      return 'Network error. Check your connection and try again.';
    }

    // Never expose unknown SQL/driver internals to the player.
    if (message) return fallback;
  }

  return fallback;
}
