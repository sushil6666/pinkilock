import { useEffect, useState } from 'react';
import type { Reveal } from '../domain/types';
import { backend } from '../services';

/** Asks the backend for the reveal once the promise is kept. Until then there is nothing to hold. */
export function useReveal(keptInviteId: string | undefined): Reveal | null {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  useEffect(() => {
    let alive = true;
    setReveal(null);
    if (keptInviteId) backend.getReveal(keptInviteId).then((r) => alive && setReveal(r), () => {});
    return () => {
      alive = false;
    };
  }, [keptInviteId]);
  return reveal;
}
