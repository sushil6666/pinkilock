/**
 * After a kept promise (WP7): "Worth showing up?" and "See them again?", once. The answers feed
 * the satisfaction figure (build plan, target B) and round two; the other person never sees them,
 * and they never touch a Trust Score. "I felt unsafe" opens the report screen as well. Once answered
 * (and not unsafe), the store's own review prompt may show (D110, src/lib/review.ts).
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { shown } from '../lib/report';
import { askForReview } from '../lib/review';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';
import { t } from '../i18n';

/** `double`: a four-person plan. The questions stay; round two, a thing between two people, does not apply. */
export function DateFeedback({ inviteId, otherId, name, double }: { inviteId: string; otherId: string; name: string; double?: boolean }) {
  const [state, setState] = useState<{ rated: boolean; roundTwo: boolean } | null>(null);
  const [worth, setWorth] = useState<boolean | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    backend.dateFeedback(inviteId).then((s) => alive && setState(s), (e) => alive && setError(shown(e, '/plan/[id]')));
    return () => {
      alive = false;
    };
  }, [inviteId]);

  const send = async (unsafe: boolean) => {
    setBusy(true);
    setError('');
    try {
      await backend.rateDate(inviteId, { worth: unsafe ? false : !!worth, again: unsafe ? false : !!again, unsafe });
      const next = await backend.dateFeedback(inviteId);
      setState(next);
      if (unsafe) router.push(`/report/${otherId}`);
      // The honest review ask (D110): the store's prompt after a kept plan, whatever they answered,
      // with no question first. Never straight after "I felt unsafe": that is a report, not a moment.
      else void askForReview(next.roundTwo ? 'match' : 'kept_plan');
    } catch (e) {
      setError(shown(e, '/plan/[id]'));
    }
    setBusy(false);
  };

  if (!state) return error ? <ErrorText text={error} /> : null;

  if (state.rated) {
    return state.roundTwo ? (
      <View style={{ gap: space.sm, borderWidth: 1, borderColor: color.gold, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg }}>
        <T v="label" c={color.gold}>{t('feedback.roundTwo')}</T>
        <T v="heading">{t('feedback.bothAgain', { name })}</T>
        <Button icon="repeat" label={t('feedback.planRoundTwo', { name })} onPress={() => router.push({ pathname: '/invite/new', params: { to: otherId } })} />
        {/* Couple mode (D120): a match can keep going in a shared corner of its own. */}
        <T v="caption" c={color.textDim}>{t('feedback.coupleBody')}</T>
        <Button kind="ghost" icon="heart" label={t('feedback.startCouple')} onPress={() => router.push('/couple')} />
      </View>
    ) : (
      <T v="caption" c={color.textDim}>{t('feedback.thanks')}</T>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <T v="label" c={color.textDim}>{t('feedback.worth')}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label={t('common.yes')} selected={worth === true} onPress={() => setWorth(true)} />
        <Chip label={t('common.no')} selected={worth === false} onPress={() => setWorth(false)} />
      </View>
      <T v="label" c={color.textDim}>{t('feedback.seeAgain', { name })}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label={t('common.yes')} selected={again === true} onPress={() => setAgain(true)} />
        <Chip label={t('feedback.notThisTime')} selected={again === false} onPress={() => setAgain(false)} />
      </View>
      <T v="caption" c={color.textDim}>{double ? t('feedback.privateDouble') : t('feedback.privateOne', { name })}</T>
      <ErrorText text={error} />
      <Button label={t('common.send')} onPress={() => send(false)} disabled={worth === null || again === null} busy={busy} />
      <Button kind="quiet" label={t('feedback.unsafe')} onPress={() => send(true)} />
    </View>
  );
}
