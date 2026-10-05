import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function encryptionKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.QESHMONDI_SQL_SECRET || process.env.JWT_SECRET || 'dev-secret';
  cachedKey = scryptSync(secret, 'qeshmondi-sql-v1', 32);
  return cachedKey;
}

export function encryptQeshmondiSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join('.');
}

export function decryptQeshmondiSecret(payload: string) {
  const [version, ivB64, tagB64, bodyB64] = payload.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || !bodyB64) {
    throw new Error('رمز ذخیره‌شده قابل خواندن نیست');
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(bodyB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
