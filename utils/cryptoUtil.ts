/**
 * 使用 Web Crypto API (AES-GCM) 对用户 API Key 进行加密/解密后存库。
 * 加密密钥来自环境变量 VITE_ENCRYPTION_KEY（32 字节 hex，即 64 个十六进制字符）。
 * 若未配置，将使用固定盐值进行派生（仅作混淆，生产环境请务必配置 VITE_ENCRYPTION_KEY）。
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

function getEncryptionKey(): Promise<CryptoKey> {
  const rawKey = process.env.VITE_ENCRYPTION_KEY;
  if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(rawKey.slice(i * 2, i * 2 + 2), 16);
    }
    return crypto.subtle.importKey('raw', bytes, { name: ALGORITHM, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
  }
  if (rawKey && rawKey.length >= 32) {
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey.slice(0, 32));
    return crypto.subtle.importKey('raw', data, { name: ALGORITHM, length: KEY_LENGTH }, false, ['encrypt', 'decrypt']);
  }
  console.warn('[GrammarZen] VITE_ENCRYPTION_KEY 未配置或格式不正确，使用默认派生密钥。生产环境请在 .env 中配置 64 位十六进制密钥。');
  const defaultSecret = 'grammarzen-default-encryption-key-v1';
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(defaultSecret.padEnd(32, '0').slice(0, 32)),
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密明文（如 API Key），返回 base64 字符串（iv + ciphertext）。
 */
export async function encrypt(plainText: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

/**
 * 解密由 encrypt 得到的 base64 字符串。
 */
export async function decrypt(encryptedBase64: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  if (combined.length < IV_LENGTH) throw new Error('Invalid encrypted payload');
  const iv = combined.slice(0, IV_LENGTH);
  const cipher = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: 128 },
    key,
    cipher
  );
  return new TextDecoder().decode(decrypted);
}
