const REDACTED = '[redacted]';

/**
 * Matched case-insensitively as a substring, so `password`, `recheckPassword`
 * and `newPassword` are all covered without a separate entry.
 */
const SENSITIVE_KEY_PATTERNS = ['password', 'token', 'authorization', 'cookie', 'secret', 'email'];

const isSensitive = (key: string): boolean => {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
};

/**
 * Key-based matching alone is not enough: an address can arrive under a key
 * that does not name it — `recipient`, `to`, `contact`. The value is checked
 * too, so a personal e-mail is masked wherever it appears rather than only
 * where the key happens to say so.
 */
const looksLikeEmail = (value: unknown): boolean =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * Returns a copy safe to write to a log. Non-sensitive values are returned as
 * they are; a value whose key looks sensitive is replaced by a placeholder.
 *
 * A log call must not be able to fail the request it is describing, so a
 * structure that cannot be walked — a circular reference, or a getter that
 * throws — is replaced by a marker rather than propagated.
 */
export const redact = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[circular]' as unknown as T;
  }
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => redact(item, seen)) as unknown as T;
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitive(key) || looksLikeEmail(nested) ? REDACTED : redact(nested, seen);
    }
    return result as T;
  } catch {
    return '[unserialisable]' as unknown as T;
  }
};
