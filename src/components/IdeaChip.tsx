/**
 * A plan option (a micro-date idea) to pick, with an arrow that opens what it actually is: what you
 * do, where, roughly what it costs and why it makes a good first meet. The one-line summary stays
 * visible either way. Tapping the row picks it; only the arrow opens and closes the details.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { MicroDateIdea } from '../domain/types';
import { t, tMaybe } from '../i18n';
import { haptic } from '../lib/haptics';
import { aria } from '../lib/web';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';

interface Props {
  idea: MicroDateIdea;
  selected?: boolean;
  onPress?: () => void;
}

const PARTS = ['what', 'where', 'cost', 'why'] as const;

export function IdeaChip({ idea, selected, onPress }: Props) {
  const [open, setOpen] = useState(false);
  const label = `${idea.emoji}  ${idea.title}`;
  const sub = t('onboarding.ideaSub', { minutes: idea.minutes, blurb: idea.blurb });
  const parts = PARTS.map((p) => [p, tMaybe(`ideaInfo.ideas.${idea.id}.${p}`)] as const).filter(([, v]) => !!v);
  const fg = selected ? color.onPink : color.text;
  const dim = selected ? color.onPink : color.textDim;

  return (
    <View style={[styles.box, selected && styles.selected]}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole={onPress ? 'button' : 'text'}
          accessibilityState={{ selected: !!selected }}
          {...(onPress ? aria({ pressed: !!selected }) : {})}
          accessibilityLabel={`${label}, ${sub}`}
          disabled={!onPress}
          onPress={() => {
            haptic.tick();
            onPress?.();
          }}
          style={styles.main}
        >
          <T v="label" c={fg}>{label}</T>
          <T v="caption" c={dim}>{sub}</T>
        </Pressable>
        {parts.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(open ? 'ideaInfo.less' : 'ideaInfo.more', { title: idea.title })}
            accessibilityState={{ expanded: open }}
            {...aria({ expanded: open })}
            hitSlop={8}
            onPress={() => setOpen((o) => !o)}
            style={styles.arrow}
          >
            <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={fg} />
          </Pressable>
        )}
      </View>
      {open && (
        <Animated.View entering={FadeIn.duration(180)} style={[styles.details, { borderTopColor: selected ? color.onPink : color.line }]}>
          {parts.map(([p, text]) => (
            <View key={p} style={styles.part}>
              <T v="caption" c={selected ? color.onPink : color.gold}>{t(`ideaInfo.${p}`)}</T>
              <T v="body" c={fg}>{text}</T>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.chip, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi, overflow: 'hidden' },
  selected: { backgroundColor: color.pink, borderColor: color.pink },
  top: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, paddingLeft: space.md, paddingVertical: space.md, gap: 2 },
  arrow: { width: 48, minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  details: { marginHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  part: { gap: 2 },
});
