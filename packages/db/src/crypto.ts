import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encryption at rest for sensitive artifacts (the saved attacks). AES-256-GCM
 * with a 32-byte key from ENCRYPTION_KEY (base64). If no key is configured the
 * value is stored as plaintext, so the system still runs in dev; a marker prefix
 * lets decrypt tell the two apart. In production the key is customer-held.
 */
const PREFIX = 'enc:v1:';

function key(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, 'base64');
  return k.length === 32 ? k : null;
}

export function isEncryptionConfigured(): boolean {
  return key() !== null;
}

export function encrypt(plaintext: string): string {
  const k = key();
  if (!k) return plaintext; // dev fallback: stored as-is
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
