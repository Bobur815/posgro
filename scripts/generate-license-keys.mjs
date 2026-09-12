// Makes the Ed25519 key pair that signs store licenses (src/shared/utils/license.ts). Run once:
//   node scripts/generate-license-keys.mjs
//
// LICENSE_SIGNING_KEY goes into the server's environment — staging and production alike, so a till
// set up against either trusts the same signer — and never into the repository. The public key
// goes into the POS build (src/main/license/license-public-key.ts). Losing the private key means
// shipping a POS release with a new public key, so keep a copy somewhere safe.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
console.log('LICENSE_SIGNING_KEY=' + privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
console.log('LICENSE_PUBLIC_KEY=' + publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
