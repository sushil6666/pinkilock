/**
 * Phone numbers for sign-in. Stored and sent in E.164 (+919876543210). A bare ten-digit number
 * is taken as Indian, since that is where Pinkilock starts.
 */
export const DEFAULT_COUNTRY_CODE = '91';

/** Returns +<digits>, or null when it cannot be a phone number. */
export function normalisePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/[^\d]/g, '');
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.length === 10) digits = DEFAULT_COUNTRY_CODE + digits;
    else if (digits.length === 11 && digits.startsWith('0')) digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
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
