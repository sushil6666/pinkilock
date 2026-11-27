/**
 * Gentle reminders (D124), in Me under notifications: one switch. At most 3 a week, between 10:00
 * and 20:00, about my own plans, Couple mode and Self love. The server sends them; this only turns
 * them on or off.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';
import { t } from '../i18n';

export function Reminders() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    backend.nudges().then((v) => alive && setOn(v), quiet('reminders.load'));
    return () => {
      alive = false;
    };
  }, []);

  const flip = async () => {
    if (on === null || busy) return;
    setBusy(true);
    setError('');
    try {
      setOn(await backend.setNudges(!on));
    } catch (e) {
      setError(shown(e, '/me'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.panel}>
        <Feather name="sun" size={18} color={on ? color.gold : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{t(on === false ? 'reminders.off' : 'reminders.on')}</T>
          <T v="caption" c={color.textDim}>{t('reminders.body')}</T>
        </View>
        {on !== null ? <Tag label={t(on ? 'reminders.turnOff' : 'reminders.turnOn')} tone={on ? color.textDim : color.gold} onPress={flip} /> : null}
      </View>
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
});
