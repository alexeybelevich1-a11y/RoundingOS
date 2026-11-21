/**
 * RoundingOS — Cross-Platform AES-256-GCM Encrypted Backup Helper
 * Wire format is 100% compatible with the RoundingOS Pixel 11 Pro Android app.
 */

const BackupCrypto = (() => {
  const ITERATIONS = 150000;

  function toBase64(bytes) {
    let bin = '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function fromBase64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(passphrase, saltBytes) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptJson(obj, passphrase) {
    if (!window.crypto?.subtle) {
      throw new Error('Web Crypto requires http://localhost (launch via Start-Hospitalist-Tracker.bat).');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(obj));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return JSON.stringify({
      format: 'roundingos-encrypted-v1',
      kdf: 'PBKDF2-HMAC-SHA256',
      iterations: ITERATIONS,
      cipher: 'AES-256-GCM',
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(cipherBuf))
    }, null, 2);
  }

  async function decryptJson(envelopeObj, passphrase) {
    if (!window.crypto?.subtle) {
      throw new Error('Web Crypto requires http://localhost (launch via Start-Hospitalist-Tracker.bat).');
    }
    const salt = fromBase64(envelopeObj.salt);
    const iv = fromBase64(envelopeObj.iv);
    const ciphertext = fromBase64(envelopeObj.ciphertext);
    const key = await deriveKey(passphrase, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  function isEncryptedEnvelope(obj) {
    return Boolean(obj && obj.format === 'roundingos-encrypted-v1' && obj.salt && obj.iv && obj.ciphertext);
  }

  return {
    encryptJson,
    decryptJson,
    isEncryptedEnvelope
  };
})();

