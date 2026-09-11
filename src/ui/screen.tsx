import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Color, Layout } from '@/design/tokens';

type Props = {
  children: ReactNode;
  /**
   * The wake screen paints its own ground edge to edge and manages its own
   * insets, so it opts out of the standard gutter.
   */
  padded?: boolean;
};

/**
 * The one place screen-level chrome is decided: the void ground, the single
 * outer gutter, and the top inset.
 *
 * The bottom inset is deliberately not applied — inside the tab group the tab
 * bar already owns it, and applying it here would double the gap.
 */
export function Screen({ children, padded = true }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top },
        padded && { paddingHorizontal: Layout.screenPadding },
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.void,
  },
});

/**
 * How much room a scrolling tab screen leaves at the bottom.
 *
 * The tab bar is part of the document flow above the Android navigation area,
 * so the screen's viewport naturally ends at the top of the tab bar. We provide
 * a clean bottom breathing room equal to `Layout.screenPadding` so the last card
 * or row does not touch the tab bar's top border.
 */
export function useTabContentInset(): number {
  return Layout.screenPadding;
}
