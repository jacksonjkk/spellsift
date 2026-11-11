export function normaliseNotepad(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function stripLineNumber(line: string): string {
  return line.replace(/^\s*\d+\.\s*/, '').trim();
}

/**
 * Returns the unique words in the notepad, upper-cased and without the
 * auto-generated "1. " prefixes. Empty lines are ignored.
 */
export function parseNotepadWords(text: string): string[] {
  const words = normaliseNotepad(text)
    .split('\n')
    .map(stripLineNumber)
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length > 0);

  return Array.from(new Set(words));
}

export function currentLineWord(text: string, cursorPosition: number): string {
  const beforeCursor = text.slice(0, cursorPosition);
  const lines = beforeCursor.split('\n');
  return stripLineNumber(lines[lines.length - 1] ?? '');
}
