import { Platform, Share } from 'react-native';

/**
 * Share a short message with a link. Phones open the share sheet. A desktop browser often has no
 * share sheet, so there the message is copied instead, and the caller says so.
 */
export async function shareOrCopy(message: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share && navigator.clipboard) {
    await navigator.clipboard.writeText(message);
    return 'copied';
  }
  await Share.share({ message });
  return 'shared';
}
