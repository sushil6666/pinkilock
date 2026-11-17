import { Text, type TextProps } from 'react-native';
import { color, type, type TypeName } from '../../theme/tokens';

interface Props extends TextProps {
  v?: TypeName;
  c?: string;
  center?: boolean;
}

/**
 * The only text component: a type style from the scale and a colour token. The `display` style is
 * each screen's headline, so it is announced as a heading (and is an `h1` in a browser).
 */
export function T({ v = 'body', c = color.text, center, style, ...rest }: Props) {
  return <Text maxFontSizeMultiplier={1.3} accessibilityRole={v === 'display' ? 'header' : undefined} {...rest} style={[type[v], { color: c }, center && { textAlign: 'center' }, style]} />;
}
