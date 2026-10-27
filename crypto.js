// Shared by the browser gate and the packaging tests; contains no password.
export const ITERATIONS = 600000;
const encoder = new TextEncoder();
const context = encoder.encode('retro-mutant-pages-v1');
export async function deriveKey(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2', hash:'SHA-256', salt, iterations:ITERATIONS},
    material, {name:'AES-GCM', length:256}, false, usage,
  );
}
export async function encryptPackage(bytes, password) {
  if (!password) throw new Error('A nonempty password is required.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:context}, key, bytes));
  const result = new Uint8Array(32 + cipher.length);
  result.set(encoder.encode('RMG1')); result.set(salt, 4); result.set(iv, 20); result.set(cipher, 32);
  return result;
}
export async function decryptPackage(bytes, password) {
  if (bytes.length < 48 || new TextDecoder().decode(bytes.slice(0,4)) !== 'RMG1') throw new Error('Unsupported package.');
  const key = await deriveKey(password, bytes.slice(4,20), ['decrypt']);
  return crypto.subtle.decrypt({name:'AES-GCM', iv:bytes.slice(20,32), additionalData:context}, key, bytes.slice(32));
}
