/**
 * Shows the Turnstile check when the backend asks for a token (src/lib/captcha.ts). Mounted once,
 * at the root, also while the app is still starting: the first anonymous sign-in needs it.
 * Usually Cloudflare decides on its own and the sheet closes by itself within a second or two.
 */
import { useEffect, useRef, useState } from 'react';
import { AppError } from '../../domain/errors';
import { t } from '../../i18n';
import { registerCaptchaHost, type CaptchaAsk } from '../../lib/captcha';
import { Sheet } from '../ui/Sheet';
import { Turnstile } from './Turnstile';

export function CaptchaHost() {
  const [ask, setAsk] = useState<CaptchaAsk | null>(null);
  const queue = useRef<CaptchaAsk[]>([]);

  useEffect(() => registerCaptchaHost((next) => {
    queue.current.push(next);
    setAsk((now) => now ?? queue.current.shift() ?? null);
  }), []);

  const done = (settle: (a: CaptchaAsk) => void) => {
    if (ask) settle(ask);
    setAsk(queue.current.shift() ?? null);
  };

  return (
    <Sheet visible={!!ask} onClose={() => done((a) => a.reject(new AppError('PA010')))} eyebrow={t('captcha.eyebrow')} title={t('captcha.title')} body={t('captcha.body')}>
      {ask ? <Turnstile onToken={(token) => done((a) => a.resolve(token))} onError={(e) => done((a) => a.reject(e))} /> : null}
    </Sheet>
  );
}
