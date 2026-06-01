import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// 32-byte key (64 hex chars) used to encrypt Plaid access tokens at rest, so a
// database leak alone can't be used to pull users' bank data. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const KEY_HEX = process.env.PLAID_ENC_KEY ?? '';
if (KEY_HEX.length !== 64) {
  throw new Error('PLAID_ENC_KEY must be a 64-character hex string (32 bytes) — set it in backend/.env.');
}
const KEY = Buffer.from(KEY_HEX, 'hex');

// Format: base64(iv) : base64(authTag) : base64(ciphertext)
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  // Backward-compat: tokens stored before encryption was added are plaintext
  // Plaid tokens (e.g. "access-sandbox-..."). Return them as-is so a missed
  // migration doesn't break syncing; they get re-encrypted on next exchange.
  if (payload.startsWith('access-')) return payload;

  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// True if a stored value still needs encrypting (used by the migration).
export function isEncrypted(payload: string): boolean {
  return !payload.startsWith('access-');
}
