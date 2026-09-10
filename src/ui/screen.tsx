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
 * How much room a scrolling tab screen has to leave at the bottom.
 *
 * The tab bar floats over the content, and on a gesture-navigation phone the
 * system inset sits under it again, so a fixed padding that looks right on one
 * device buries the last row on another.
 */
export function useTabContentInset(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + Layout.tabBar + Layout.screenPadding;
}
