/**
 * Phone numbers for sign-in. Stored and sent in E.164 (+919876543210). A number typed the way
 * people write it at home (with or without the leading 0) takes the picked country's dialling code
 * (WP9: no country is assumed); one that starts with + or 00 already has its own.
 */

/** Returns +<digits>, or null when it cannot be a phone number. `dial` is the picked country's code, like '91'. */
export function normalisePhone(input: string, dial: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else {
      const national = digits.replace(/^0/, '');
      // Up to 11 digits is a national number; longer, it already carries the country code.
      digits = national.length <= 11 && !(national.length > 10 && national.startsWith(dial)) ? dial + national : digits;
    }
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return `+${digits}`;
}

/** +919876543210 -> "+91 ••••• •3210", for showing which number a code went to. */
export function maskPhone(phone: string): string {
  const d = phone.replace(/[^\d]/g, '');
  const country = d.length > 10 ? d.slice(0, d.length - 10) : '';
  return `${country ? `+${country} ` : ''}••••• •${d.slice(-4)}`;
}

export const CODE_LENGTH = 6;
