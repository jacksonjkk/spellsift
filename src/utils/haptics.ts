/**
 * Small haptic helper. Vibration is best-effort: unsupported browsers and
 * devices simply ignore it, and a blocked vibration must never throw.
 */
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Haptics are optional; ignore permission/policy failures.
  }
}
