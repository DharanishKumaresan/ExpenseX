import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcrypt at cost 12 — roughly 250ms per hash on commodity hardware, which is
 * the point: it makes offline cracking of a leaked table expensive. Plaintext
 * passwords are never stored, logged, or returned from any function here.
 */
const COST = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plaintext, hash);
  } catch {
    return false;
  }
}

/**
 * Burn roughly one hash's worth of time when an email does not exist, so
 * response timing cannot be used to enumerate registered accounts.
 */
export async function fakeVerifyDelay(): Promise<void> {
  await bcrypt.compare('timing-equaliser', '$2a$12$C6UzMDM.H6dfI/f/IKcEe.uQZzPFN3sJ9pWQ6FEpKqRHNiVoTGqFy');
}

export interface PasswordStrength {
  ok: boolean;
  message?: string;
}

/**
 * Length-first policy (NIST SP 800-63B): a long passphrase beats a short
 * string with a symbol bolted on. We block only the genuinely weak cases.
 */
export function checkPasswordStrength(password: string, email?: string): PasswordStrength {
  if (password.length < 10) return { ok: false, message: 'Use at least 10 characters.' };
  if (password.length > 200) return { ok: false, message: 'That password is too long.' };

  if (/^(.)\1+$/.test(password)) return { ok: false, message: 'Avoid a single repeated character.' };

  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length > 2 && password.toLowerCase().includes(local)) {
    return { ok: false, message: 'Do not use your email address in your password.' };
  }

  const common = [
    'password', '12345678', 'qwerty', 'letmein', 'welcome', 'iloveyou',
    'admin123', 'password123', '1234567890', 'abc123456',
  ];
  const lowered = password.toLowerCase();
  if (common.some((entry) => lowered === entry || lowered.startsWith(entry))) {
    return { ok: false, message: 'That password is too common. Pick something less guessable.' };
  }

  return { ok: true };
}
