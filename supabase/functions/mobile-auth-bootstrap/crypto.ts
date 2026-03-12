const AES_ALGO = 'AES-GCM';
const IV_LENGTH = 12;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(secret: string) {
  const secretBytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest('SHA-256', secretBytes);
  return crypto.subtle.importKey('raw', digest, AES_ALGO, false, ['encrypt', 'decrypt']);
}

export async function encryptBootstrapRefreshToken(refreshToken: string, secret: string) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = new TextEncoder().encode(refreshToken);
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGO, iv },
    key,
    plaintext
  );

  return JSON.stringify({
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptBootstrapRefreshToken(payload: string, secret: string) {
  const parsed = JSON.parse(payload) as { iv?: string; ciphertext?: string };
  if (!parsed.iv || !parsed.ciphertext) {
    throw new Error('Invalid encrypted bootstrap payload');
  }

  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: base64ToBytes(parsed.iv) },
    key,
    base64ToBytes(parsed.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}
