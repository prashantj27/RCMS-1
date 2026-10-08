import bcrypt from "bcryptjs";

const COST = 12;
// A real hash, computed once, so unknown-user logins cost the same as real ones (no user enumeration by timing).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("rcms-timing-equaliser", COST));

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? (await getDummyHash()));
  return hash !== null && ok;
}

/** Returns an error message, or null if acceptable. */
export function passwordPolicyError(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > 128) return "Password must be at most 128 characters";
  if (password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4) {
    return "Password must not contain your email name";
  }
  if (/^(.)\1+$/.test(password)) return "Password is too repetitive";
  return null;
}
