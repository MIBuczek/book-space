/**
 * Escapes the regular-expression metacharacters in a user-supplied search term.
 *
 * A substring search is not a pattern: without this a term containing `.` or `*` is read as
 * a pattern (matching more than the caller asked for) and a term such as `(` is an invalid
 * expression the driver rejects. Both list reads that turn a search term into a
 * case-insensitive regex — the booking list (FR-021) and the client list (FR-024) — share
 * this, because one copy escaping and the other not is exactly the drift that matters.
 */
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
