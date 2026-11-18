/** Pure, so tests/unit/share.test.ts runs it in Node. */
import { t } from '../i18n';

/** The words for "Share my date": enough for a friend to find you, nothing about anyone's contact. */
export function shareText(p: { name: string; age: number; idea: string; place: string; when: string; endsBy: string }): string {
  return [
    t('shareText.meeting', { name: p.name, age: p.age }),
    t('shareText.what', { idea: p.idea, when: p.when }),
    t('shareText.where', { place: p.place }),
    t('shareText.check', { time: p.endsBy }),
  ].join('\n');
}
