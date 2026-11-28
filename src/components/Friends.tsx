/** The way into Bring a friend (D118), on Me. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Entry } from '@/components/ui/Entry';
import { color } from '@/theme/tokens';
import { t } from '@/i18n';

export function FriendsEntry() {
  return <Entry tone="gold" icon={<Feather name="gift" size={20} color={color.gold} />} title={t('friends.meTitle')} spoken={t('friends.meOpen')} onPress={() => router.push('/friends')} />;
}

