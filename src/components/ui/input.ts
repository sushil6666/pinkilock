import { Platform } from 'react-native';
import { color, radius, space, type } from '../../theme/tokens';

/** The one text-input look. In a browser the focus ring is pale lavender, not the browser's black and white one. */
const webFocus = Platform.OS === 'web' ? ({ outlineColor: color.textDim } as object) : {};
export const inputStyle = [type.heading, { color: color.text, backgroundColor: color.surfaceHi, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: space.lg, minHeight: 56 }, webFocus];

/**
 * The same box for sentences: what happened, a note, a message. Body-sized text, so a long
 * placeholder or answer reads as writing and is not cut off, and the text starts at the top.
 */
export const textAreaStyle = [...inputStyle, type.body, { minHeight: 96, paddingVertical: space.md, textAlignVertical: 'top' as const }];
