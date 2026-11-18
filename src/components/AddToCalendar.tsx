/**
 * "Add to calendar" on a locked plan (ROADMAP Phase 4): a calendar file made on the phone, handed
 * to the person (src/lib/calendarFile.ts). Hidden where the phone or browser cannot hand one over.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Invite } from '../domain/types';
import { t } from '../i18n';
import { addToCalendar, calendarAvailable } from '../lib/calendarFile';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { space } from '../theme/tokens';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';

export function AddToCalendar({ invite, idea, who }: { invite: Invite; idea: string; who: string }) {
  const [can, setCan] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    calendarAvailable().then(setCan, quiet('calendar.available'));
  }, []);
  if (!can) return null;

  const add = () => {
    setError('');
    addToCalendar({
      id: invite.id,
      title: t('calendar.title', { idea, who }),
      startsAt: invite.startsAt,
      minutes: invite.minutes,
      place: invite.place,
      note: t('calendar.note'),
    }, t('calendar.add')).catch((e) => setError(shown(e, '/plan/[id]')));
  };

  return (
    <View style={{ gap: space.sm }}>
      <Button kind="ghost" icon="calendar" label={t('calendar.add')} onPress={add} />
      <ErrorText text={error} />
    </View>
  );
}
