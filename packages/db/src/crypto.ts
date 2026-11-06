import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for sensitive artifacts (the saved attacks). AES-256-GCM
 * with a 32-byte key from ENCRYPTION_KEY (base64). If no key is configured the
 * value is stored as plaintext, so the system still runs in dev; a marker prefix
 * lets decrypt tell the two apart. In production the key is customer-held.
 */
const PREFIX = 'enc:v1:';

/**
 * Resolve the key, failing CLOSED on misconfiguration. Three cases:
 *  - unset        -> null (documented dev fallback: values stored as plaintext)
 *  - valid 32 B   -> the key
 *  - set but wrong size -> throw. A malformed key must NEVER silently downgrade
 *    to the plaintext fallback: an operator who mistypes the key would otherwise
 *    store sensitive attacks in the clear while believing they are encrypted.
 */
function key(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY is set but is not a 32-byte base64 key. Refusing to fall back to plaintext for sensitive data — fix the key, or unset it for local dev.',
    );
  }
  return k;
}

export function isEncryptionConfigured(): boolean {
  // true only when a valid key is present. A set-but-malformed key throws from
  // key(), surfacing the misconfiguration instead of reporting "not configured".
  return key() !== null;
}

export function encrypt(plaintext: string): string {
  const k = key(); // throws if the key is set but malformed (fail closed)
  if (!k) return plaintext; // no key configured: documented dev fallback
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string): string {
  if (!payload.startsWith(PREFIX)) return payload; // stored plaintext
  const k = key();
  if (!k) throw new Error('ENCRYPTION_KEY required to read an encrypted value');
  const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
