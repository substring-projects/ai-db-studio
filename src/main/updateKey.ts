/**
 * Public half of the key that signs release update files (see scripts/update-keygen.mjs).
 * The private half is the UPDATE_SIGNING_KEY repository secret and never enters the repo.
 * Changing this key stops installed copies from accepting updates signed with the old one.
 */
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANtEYcpENb8zIysR3UmLdJof9mOf32xpapFRoEN9FGF0=
-----END PUBLIC KEY-----
`;
