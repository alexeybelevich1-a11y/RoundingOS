/**
 * RoundingOS — encryption helpers (WebCrypto only, nothing leaves the device).
 *
 * BackupCrypto  export/import files (.rnos). Wire format is 100% compatible with the
 *               RoundingOS Pixel 11 Pro Android app: the envelope names its own iteration count.
 *               New files use 600,000 PBKDF2 iterations; files made with 150,000 still open.
 * KeyCrypto     the on-device database (src/core/store.js): a random 256-bit data key that
 *               encrypts every record (AES-256-GCM, fresh 12-byte IV per write), stored only
 *               wrapped by the passphrase (PBKDF2-SHA256, 600,000 iterations) and, optionally,
 *               by the recovery key. Unwrapped, it is a non-extractable CryptoKey kept in memory.
 * RecoveryWords 12 words = 128 random bits + 4-bit checksum, BIP-39 encoding
 *               (word list: vendor/bip39/english.js). The words are never stored.
 */

const CryptoUtil = (() => {
  function requireSubtle() {
    if (!window.crypto?.subtle) {
      throw new Error('Encryption needs the installed app or an https:// / http://localhost address (not a file:// page).');
    }
    return window.crypto.subtle;
  }

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

  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
  const utf8 = s => new TextEncoder().encode(s);

  /** PBKDF2-SHA256 → AES-256-GCM key (not extractable). */
  async function pbkdf2Key(passphrase, saltBytes, iterations) {
    const subtle = requireSubtle();
    const baseKey = await subtle.importKey('raw', utf8(passphrase), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  return { requireSubtle, toBase64, fromBase64, randomBytes, utf8, pbkdf2Key };
})();

const BackupCrypto = (() => {
  const ITERATIONS = 600000;
  const LEGACY_ITERATIONS = 150000; // files made before phase 4 may lack the field
  const MIN_ITERATIONS = 100000;
  const MAX_ITERATIONS = 10000000;
  const { toBase64, fromBase64, randomBytes, utf8, pbkdf2Key, requireSubtle } = CryptoUtil;

  async function encryptJson(obj, passphrase) {
    const subtle = requireSubtle();
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await pbkdf2Key(passphrase, salt, ITERATIONS);
    const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(obj)));

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
    const subtle = requireSubtle();
    const iterations = envelopeObj.iterations == null ? LEGACY_ITERATIONS : Number(envelopeObj.iterations);
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
      throw new Error('Unsupported backup file (iteration count)');
    }
    const key = await pbkdf2Key(passphrase, fromBase64(envelopeObj.salt), iterations);
    const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelopeObj.iv) }, key, fromBase64(envelopeObj.ciphertext));
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  function isEncryptedEnvelope(obj) {
    return Boolean(obj && obj.format === 'roundingos-encrypted-v1' && obj.salt && obj.iv && obj.ciphertext);
  }

  return { encryptJson, decryptJson, isEncryptedEnvelope, ITERATIONS };
})();

const KeyCrypto = (() => {
  const PASS_ITERATIONS = 600000;
  const CODEC = 'aes-gcm-1';
  const WRAP_AAD = 'roundingos:data-key:v1';
  const RECOVERY_INFO = 'roundingos:recovery-key:v1';
  const { toBase64, fromBase64, randomBytes, utf8, pbkdf2Key, requireSubtle } = CryptoUtil;

  /** Fresh data key: the raw bytes (to wrap once, then wipe) and the in-memory CryptoKey. */
  async function generateDataKey() {
    const raw = randomBytes(32);
    return { raw, key: await importDataKey(raw) };
  }

  function importDataKey(raw) {
    return requireSubtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /** Recovery key: HKDF-SHA256 over the 128-bit recovery entropy (random, so no slow KDF is needed). */
  async function recoveryKey(entropy, saltBytes) {
    const subtle = requireSubtle();
    const base = await subtle.importKey('raw', entropy, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: utf8(RECOVERY_INFO) },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function seal(kek, raw, extra) {
    const iv = randomBytes(12);
    const ct = await requireSubtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(WRAP_AAD) }, kek, raw);
    return { ...extra, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
  }

  async function open(kek, slot) {
    const raw = await unwrapRaw(kek, slot);
    try { return await importDataKey(raw); } finally { raw.fill(0); }
  }

  /** The data key locked by a passphrase: { kdf, iterations, salt, iv, ct }. */
  async function wrapWithPassphrase(raw, passphrase) {
    const salt = randomBytes(16);
    const kek = await pbkdf2Key(passphrase, salt, PASS_ITERATIONS);
    return seal(kek, raw, { kdf: 'PBKDF2-SHA256', iterations: PASS_ITERATIONS, salt: toBase64(salt) });
  }

  /** Throws (OperationError) on a wrong passphrase: AES-GCM checks the tag. */
  async function unwrapWithPassphrase(slot, passphrase) {
    return open(await pbkdf2Key(passphrase, fromBase64(slot.salt), slot.iterations), slot);
  }

  async function wrapWithRecovery(raw, entropy) {
    const salt = randomBytes(16);
    return seal(await recoveryKey(entropy, salt), raw, { kdf: 'HKDF-SHA256', salt: toBase64(salt) });
  }

  async function unwrapWithRecovery(slot, entropy) {
    return open(await recoveryKey(entropy, fromBase64(slot.salt)), slot);
  }

  async function unwrapRaw(kek, slot) {
    return new Uint8Array(await requireSubtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(slot.iv), additionalData: utf8(WRAP_AAD) }, kek, fromBase64(slot.ct)
    ));
  }

  /** Recovery words + a new passphrase → { key, passSlot }: the forgotten passphrase is replaced. */
  async function recoverAndRewrap(recoverySlot, entropy, newPassphrase) {
    const raw = await unwrapRaw(await recoveryKey(entropy, fromBase64(recoverySlot.salt)), recoverySlot);
    try {
      return { key: await importDataKey(raw), passSlot: await wrapWithPassphrase(raw, newPassphrase) };
    } finally { raw.fill(0); }
  }

  /** Old passphrase + new passphrase → { key, passSlot }. */
  async function changePassphrase(passSlot, oldPassphrase, newPassphrase) {
    const raw = await unwrapRaw(await pbkdf2Key(oldPassphrase, fromBase64(passSlot.salt), passSlot.iterations), passSlot);
    try {
      return { key: await importDataKey(raw), passSlot: await wrapWithPassphrase(raw, newPassphrase) };
    } finally { raw.fill(0); }
  }

  /** One record → { fmt, iv, ct }. `aad` ties the ciphertext to its row (e.g. "patient:<id>"). */
  async function encryptRecord(key, text, aad) {
    const iv = randomBytes(12);
    const ct = await requireSubtle().encrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, utf8(text));
    return { fmt: CODEC, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) };
  }

  async function decryptRecord(key, payload, aad) {
    const buf = await requireSubtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv), additionalData: utf8(aad) }, key, fromBase64(payload.ct)
    );
    return new TextDecoder().decode(buf);
  }

  return {
    CODEC,
    PASS_ITERATIONS,
    generateDataKey,
    wrapWithPassphrase,
    unwrapWithPassphrase,
    wrapWithRecovery,
    unwrapWithRecovery,
    recoverAndRewrap,
    changePassphrase,
    encryptRecord,
    decryptRecord
  };
})();

const RecoveryWords = (() => {
  const COUNT = 12;   // 128 bits of entropy + 4 checksum bits = 12 × 11 bits
  const ENTROPY_BYTES = 16;

  function list() {
    if (typeof BIP39_ENGLISH === 'undefined' || BIP39_ENGLISH.length !== 2048) throw new Error('Recovery word list did not load');
    return BIP39_ENGLISH;
  }

  async function checksumBits(entropy) {
    const hash = new Uint8Array(await CryptoUtil.requireSubtle().digest('SHA-256', entropy));
    return hash[0] >> 4; // first ENTROPY_BYTES*8/32 = 4 bits
  }

  /** 16 bytes → 12 words (BIP-39). */
  async function fromEntropy(entropy) {
    const words = list();
    let bits = '';
    entropy.forEach(b => { bits += b.toString(2).padStart(8, '0'); });
    bits += (await checksumBits(entropy)).toString(2).padStart(4, '0');
    const out = [];
    for (let i = 0; i < COUNT; i++) out.push(words[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
    return out;
  }

  /** New random words: { words, entropy }. */
  async function generate() {
    const entropy = CryptoUtil.randomBytes(ENTROPY_BYTES);
    return { words: await fromEntropy(entropy), entropy };
  }

  /** Splits what someone typed: any spaces, commas, numbering ("1." "2)") or capitals. */
  function normalize(input) {
    const parts = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
    return parts.map(w => String(w).toLowerCase().replace(/^\d+[.)]?/, '').trim()).filter(Boolean);
  }

  /** Words → 16 bytes. Throws a readable error for a wrong count, an unknown word or a bad checksum. */
  async function toEntropy(input) {
    const words = normalize(input);
    if (words.length !== COUNT) throw new Error(`Enter all ${COUNT} recovery words (got ${words.length}).`);
    const index = new Map(list().map((w, i) => [w, i]));
    let bits = '';
    for (const w of words) {
      if (!index.has(w)) throw new Error(`"${w}" is not one of the recovery words. Check the spelling.`);
      bits += index.get(w).toString(2).padStart(11, '0');
    }
    const entropy = new Uint8Array(ENTROPY_BYTES);
    for (let i = 0; i < ENTROPY_BYTES; i++) entropy[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    if (parseInt(bits.slice(128), 2) !== await checksumBits(entropy)) {
      throw new Error('These words do not check out. One may be wrong or out of order.');
    }
    return entropy;
  }

  return { COUNT, generate, fromEntropy, toEntropy, normalize };
})();
