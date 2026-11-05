/** Marks a stored value as encrypted, and leaves room to change the format later. */
const PREFIX = 'enc:v1:';

/** The operating system's encryption, kept behind an interface so the rules can be tested. */
export interface SecretCipher {
  isAvailable: () => boolean;
  encrypt: (plain: string) => string;
  decrypt: (encoded: string) => string;
}

export const isSealed = (value: unknown): value is string => typeof value === 'string' && value.startsWith(PREFIX);

/**
 * The form a secret takes on disk. Without working encryption the secret is not stored at
 * all: it lasts for the session and must be entered again, rather than falling back to plain text.
 */
export function seal(value: string | undefined, cipher: SecretCipher): string | undefined {
  if (!value || !cipher.isAvailable()) return undefined;
  return PREFIX + cipher.encrypt(value);
}

export interface OpenedSecret {
  value?: string;
  /** Was stored unencrypted by an older version, so it needs rewriting. */
  legacyPlaintext?: boolean;
  /** Could not be decrypted right now. Kept so that it isn't destroyed by the next save. */
  locked?: string;
}

export function open(stored: string | undefined, cipher: SecretCipher): OpenedSecret {
  if (!stored) return {};
  if (!isSealed(stored)) return { value: stored, legacyPlaintext: true };
  try {
    return { value: cipher.decrypt(stored.slice(PREFIX.length)) };
  } catch {
    return { locked: stored };
  }
}
