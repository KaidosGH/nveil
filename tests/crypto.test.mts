// Self-check for lib/crypto.ts. Run: npm run check
// ponytail: assert-based, no test framework — fails loudly if the crypto
// round-trip, checksums, or base64url encoding ever break.
import assert from 'node:assert/strict';
import {
  decrypt,
  encrypt,
  fromBase64Url,
  generateCreatorToken,
  generateKey,
  keyChecksum,
  toBase64Url,
  tokenHash,
  unwrapKeyWithPassword,
  wrapKeyWithPassword,
} from '../lib/crypto.ts';

// 1. Encrypt/decrypt round trip (incl. unicode + empty-ish content).
const { key, keyString } = await generateKey();
const plaintext = 'hunter2 🔑 # Heading\n\n- item one\n- item two';
const { ciphertext, iv } = await encrypt(key, plaintext);
assert.equal(await decrypt(keyString, iv, ciphertext), plaintext);

// 2. Encoding conventions: 32-byte key -> 43 b64url chars, 12-byte IV -> 16.
assert.equal(keyString.length, 43);
assert.equal(iv.length, 16);
assert.equal(toBase64Url(fromBase64Url(keyString)), keyString);

// 3. Key checksum detects a wrong key before any decryption is attempted.
const { keyString: otherKey } = await generateKey();
assert.notEqual(await keyChecksum(otherKey), await keyChecksum(keyString));

// 4. Decryption with the wrong key fails (GCM auth).
await assert.rejects(() => decrypt(otherKey, iv, ciphertext));

// 5. Creator token hashes are stable and 43 chars.
const token = generateCreatorToken();
assert.equal(await tokenHash(token), await tokenHash(token));
assert.equal((await tokenHash(token)).length, 43);

// 6. Password envelope: wrap and unwrap recover the content key (unicode password).
const pass = 'pässwörd 🔐 42';
const envelope = await wrapKeyWithPassword(keyString, pass);
assert.equal(envelope.hasPassword, true);
assert.equal(await unwrapKeyWithPassword(pass, envelope.wrappedKey, envelope.wrapIv, envelope.wrapSalt), keyString);

// 7. A wrong password fails GCM auth — and the envelope is useless without it.
await assert.rejects(() => unwrapKeyWithPassword('wrong', envelope.wrappedKey, envelope.wrapIv, envelope.wrapSalt));
assert.notEqual(envelope.wrappedKey, keyString);

// 8. Wrapping is per-use fresh: two envelopes for the same key differ (salt+IV),
//    but both unwrap to the same content key.
const second = await wrapKeyWithPassword(keyString, pass);
assert.notEqual(second.wrappedKey, envelope.wrappedKey);
assert.equal(await unwrapKeyWithPassword(pass, second.wrappedKey, second.wrapIv, second.wrapSalt), keyString);

console.log('crypto self-check passed');
