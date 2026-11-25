/**
 * Razorpay Checkout on the website (D104): UPI, cards and net banking in Razorpay's own frame. The
 * card or UPI id never touches Pinkilock. The script comes from checkout.razorpay.com (allowed by
 * web/_headers) and is loaded only when someone taps a pack. What it answers is only a claim: the
 * `wallet` Edge Function checks the signature and asks Razorpay before any credit is added.
 *
 * Not used on the phone apps: digital credits there go through the store's billing (O15).
 */
import { Platform } from 'react-native';
import { AppError } from '../domain/errors';
import { color } from '../theme/tokens';

const SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

export interface Paid {
  order: string;
  payment: string;
  signature: string;
}

type RazorpayCtor = new (options: Record<string, unknown>) => { open(): void; on(event: string, fn: () => void): void };

function load(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new AppError('PC001')));
    s.onerror = () => reject(new AppError('PC001'));
    document.head.appendChild(s);
  });
}

/** Opens Checkout for an order. The paid answer, or null when the person closed it without paying. */
export async function openCheckout(o: { key: string; order: string; paise: number; title: string; about: string }): Promise<Paid | null> {
  if (Platform.OS !== 'web') throw new AppError('PL144');
  const Razorpay = await load();
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: o.key,
      order_id: o.order,
      amount: o.paise,
      currency: 'INR',
      name: o.title,
      description: o.about,
      theme: { color: color.gold },
      handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        resolve({ order: r.razorpay_order_id, payment: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.open();
  });
}
