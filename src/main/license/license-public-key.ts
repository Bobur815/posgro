/**
 * The public half of the key the server signs store licenses with (`LICENSE_SIGNING_KEY`, made by
 * scripts/generate-license-keys.mjs). With it a till can check a license and never make one.
 *
 * Changing it — a lost or leaked private key — means every till needs a POS release before it will
 * accept a license signed with the new key.
 */
export const LICENSE_PUBLIC_KEY = 'MCowBQYDK2VwAyEAPvYW9L5sRSWz0C30IrO3cp4Pgp+TdJ21+32FJHFcOiE=';
