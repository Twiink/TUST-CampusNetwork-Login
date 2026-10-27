/** Redact before an entry reaches any listener, persistence adapter or UI. */
const secretKey =
  /^(?:password|passwd|user_password|userPassword|wifiPassword|preSharedKey|keyMaterial|psk|authorization|cookie|token|access_token)$/i;
export function redactText(value: string): string {
  return value
    .replace(
      /((?:user_password|password|passwd|psk|keyMaterial|access_token|token)\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&\n]+)/gi,
      '$1[REDACTED]'
    )
    .replace(/(\b(?:password|passwd|psk)\s+)(?:"[^"\n]*"|'[^'\n]*'|[^\s\n]+)/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@');
}
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      secretKey.test(key) ? '[REDACTED]' : redact(v, seen),
    ])
  );
}
