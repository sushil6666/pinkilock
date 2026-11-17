/** Pure, so tests/unit/share.test.ts runs it in Node. */
/** The words for "Share my date": enough for a friend to find you, nothing about anyone's contact. */
export function shareText(p: { name: string; age: number; idea: string; place: string; when: string; endsBy: string }): string {
  return [
    `I'm meeting ${p.name} (${p.age}) from Pinkilock.`,
    `${p.idea}, ${p.when}.`,
    `Where: ${p.place}.`,
    `If you haven't heard from me by ${p.endsBy}, check on me.`,
  ].join('\n');
}
