/**
 * Share my date, and the after-date check (from the market review). The plan goes to a friend
 * through the phone's own share sheet: Pinkilock stores no trusted contact and sends nothing.
 */
import { useState } from 'react';
import { Share, View } from 'react-native';
import { timeLabel, whenLabel } from '../domain/time';
import type { Invite, Profile } from '../domain/types';
import { quiet } from '../lib/log';
import { safetyCheckAvailable, scheduleSafetyCheck, shareText } from '../lib/safetyCheck';
import { shown } from '../lib/report';
import { color, space } from '../theme/tokens';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

export function ShareMyDate({ invite, other, idea }: { invite: Invite; other: Profile; idea: string }) {
  const [checkSet, setCheckSet] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const endsAt = invite.startsAt + invite.minutes * 60_000;

  const share = () => {
    setError('');
    Share.share({ message: shareText({ name: other.name, age: other.age, idea, place: invite.place, when: whenLabel(invite.startsAt, Date.now()), endsBy: timeLabel(endsAt + 30 * 60_000) }) })
      .catch((e) => setError(shown(e, '/plan/[id]')));
  };
  const check = () => {
    scheduleSafetyCheck(invite.id, other.name, endsAt).then(setCheckSet, quiet('safety_check.schedule'));
  };

  return (
    <View style={{ gap: space.sm }}>
      <T v="label" c={color.textDim}>Stay safe</T>
      <Button kind="ghost" icon="share-2" label="Share my date with a friend" onPress={share} />
      {safetyCheckAvailable() ? (
        checkSet ? <T v="caption" c={color.volt}>{`We will ask "Home safe?" at ${timeLabel(endsAt + 15 * 60_000)}.`}</T>
          : <Button kind="ghost" icon="bell" label="Check on me after" onPress={check} />
      ) : null}
      {checkSet === false ? <T v="caption" c={color.textDim}>Turn on notifications for Pinkilock to get the check.</T> : null}
      <ErrorText text={error} />
    </View>
  );
}
