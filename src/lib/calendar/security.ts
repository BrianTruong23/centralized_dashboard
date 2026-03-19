import crypto from 'crypto';

type OAuthStatePayload = {
  u: string;
  r: string;
  n: string;
  t: number;
};

function getEncryptionKey(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing CALENDAR_TOKEN_ENCRYPTION_KEY');

  const trimmed = raw.trim();
  const buffer = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  if (buffer.length !== 32) {
    throw new Error('CALENDAR_TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  }

  return buffer;
}

function getStateSigningKey(): Buffer {
  const raw = process.env.CALENDAR_OAUTH_STATE_SECRET || process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing CALENDAR_OAUTH_STATE_SECRET');
  return crypto.createHash('sha256').update(raw).digest();
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, bodyPart] = payload.split('.');
  if (!ivPart || !tagPart || !bodyPart) throw new Error('Invalid encrypted payload');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), fromBase64Url(ivPart), { authTagLength: 16 });
  decipher.setAuthTag(fromBase64Url(tagPart));
  const decrypted = Buffer.concat([decipher.update(fromBase64Url(bodyPart)), decipher.final()]);
  return decrypted.toString('utf8');
}

export function createOAuthState(userId: string, returnTo: string): string {
  const payload: OAuthStatePayload = {
    u: userId,
    r: returnTo || '/',
    n: crypto.randomUUID(),
    t: Date.now(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getStateSigningKey())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function readOAuthState(state: string, maxAgeMs = 10 * 60 * 1000): OAuthStatePayload {
  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) throw new Error('Invalid OAuth state');

  const expected = crypto
    .createHmac('sha256', getStateSigningKey())
    .update(encodedPayload)
    .digest();
  const actual = fromBase64Url(signature);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('Invalid OAuth state');
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as OAuthStatePayload;
  if (!payload?.u || !payload?.r || !payload?.n || !payload?.t) {
    throw new Error('Invalid OAuth state');
  }
  if (Date.now() - payload.t > maxAgeMs) {
    throw new Error('OAuth state expired');
  }
  return payload;
}
