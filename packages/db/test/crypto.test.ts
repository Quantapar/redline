import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, isEncryptionConfigured } from '../src/crypto.js';

describe('encryption at rest', () => {
  beforeEach(() => { process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64'); });

  it('round-trips a value', () => {
    const secret = 'function testExploit() public { target.withdraw(); }';
    const enc = encrypt(secret);
    expect(enc).toMatch(/^enc:v1:/);
    expect(enc).not.toContain('withdraw');
    expect(decrypt(enc)).toBe(secret);
  });
  it('produces different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });
  it('fails to decrypt tampered ciphertext (GCM auth)', () => {
    const enc = encrypt('secret');
    const tampered = enc.slice(0, -4) + 'AAAA';
    expect(() => decrypt(tampered)).toThrow();
  });
  it('passes through plaintext when no key is set', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(encrypt('hello')).toBe('hello');
    expect(decrypt('hello')).toBe('hello');
  });
  it('rejects a wrong-size key', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(isEncryptionConfigured()).toBe(false);
  });
});
