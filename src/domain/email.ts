/**
 * Email addresses for sign-in codes. Email is the free way to keep an account: Supabase sends
 * the code through whatever mail sender the project has (see OPERATIONS.md, "Email sign-in").
 */

/** Trimmed and lower-cased, or null when it cannot be an email address. */
export function normaliseEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return null;
  return e;
}

/** sushil@gmail.com -> "s•••@gmail.com", for showing where a code went. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}•••@${domain ?? ''}`;
}
