/** Only absolute http(s) URLs — blocks javascript:, data:, and protocol-relative tricks. */
export function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

/** Same-origin relative path for post-login redirects (prevents open redirects). */
export function safeNextPath(raw: string | null, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
