/**
 * Optional, privacy-conscious error reporting.
 *
 * Set VITE_ERROR_REPORT_URL to an HTTPS endpoint (for example a Sentry tunnel,
 * a Supabase Edge Function, or your own collector) to receive a small JSON
 * payload when an unhandled error occurs. No user ids, emails, or chat text are
 * included. If the variable is unset, errors are only logged to the console.
 */
const ERROR_REPORT_URL = import.meta.env.VITE_ERROR_REPORT_URL as string | undefined;

interface ErrorPayload {
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  url: string;
  timestamp: string;
}

export function reportError(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  console.error('[SpellSift] Unhandled error:', error, context);

  if (!ERROR_REPORT_URL) return;

  const payload: ErrorPayload = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };

  try {
    void fetch(ERROR_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Reporting must never break the app.
    });
  } catch {
    // Ignore synchronous fetch errors (for example a malformed endpoint).
  }
}
