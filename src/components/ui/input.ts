import { Platform } from 'react-native';
import { color, radius, space, type } from '../../theme/tokens';

/** The one text-input look. In a browser the focus ring is sky blue, not the browser's black and white one. */
const webFocus = Platform.OS === 'web' ? ({ outlineColor: color.textDim } as object) : {};
export const inputStyle = [type.heading, { color: color.text, backgroundColor: color.surfaceHi, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, paddingHorizontal: space.lg, minHeight: 56 }, webFocus];
