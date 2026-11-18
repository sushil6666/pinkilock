import { useEffect, useState } from 'react';
import type { Reveal } from '../domain/types';
import { backend } from '../services';
import { quiet } from './log';

/**
 * Asks the backend for the reveal once the promise is kept. Until then there is nothing to hold.
 * On a double, `profileId` names the person on the other side; leave it out when they may not be shown.
 */
export function useReveal(keptInviteId: string | undefined, profileId?: string): Reveal | null {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  useEffect(() => {
    let alive = true;
    setReveal(null);
    if (keptInviteId) backend.getReveal(keptInviteId, profileId).then((r) => alive && setReveal(r), quiet('reveal'));
    return () => {
      alive = false;
    };
  }, [keptInviteId, profileId]);
  return reveal;
}
