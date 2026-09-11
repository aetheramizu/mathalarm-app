import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Color, Layout, Space } from '@/design/tokens';
import { Type } from '@/design/typography';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Pinned between the title and the scrolling body.
   *
   * For the one control a form is really about — and, just as importantly, for
   * anything that scrolls itself. A vertical scroller nested inside the body's
   * vertical scroller never receives the drag on Android: the outer view
   * intercepts it and the inner one sits there looking broken.
   */
  header?: ReactNode;
  /** Pinned below the scrolling body, so the save action is always reachable. */
  footer?: ReactNode;
};

/**
 * A bottom sheet, built on the platform `Modal`.
 *
 * The reference design blurs the page behind the sheet. That is `expo-blur`, a
 * native dependency taken on for an effect, so this uses a plain dark scrim
 * instead — measured against the void ground rather than assumed, at an opacity
 * that keeps the sheet clearly in front.
 *
 * The body scrolls and the footer does not: the form is taller than a phone in
 * landscape or at large system text sizes, and a save button that scrolls out
 * of reach is how a user ends up unable to finish.
 */
export function Sheet({ visible, title, onClose, children, header, footer }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      // Android's own back gesture closes the sheet, which is the behaviour a
      // user expects; only the wake screen ever refuses back.
      onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Space.md) }]}>
          <View style={styles.header}>
            <Text style={[Type.titleLg, styles.title]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              android_ripple={{ color: Color.borderStrong, radius: 24, borderless: true }}
              style={styles.close}>
              <MaterialIcons name="close" size={22} color={Color.textSecondary} />
            </Pressable>
          </View>

          {header ? <View style={styles.pinned}>{header}</View> : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(4, 4, 8, 0.75)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Color.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Color.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Layout.screenPadding,
    paddingRight: Space.sm,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Color.border,
  },
  title: {
    flex: 1,
  },
  close: {
    width: Layout.minTouch,
    height: Layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinned: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.lg,
  },
  body: {
    flexGrow: 0,
    // Without this the body refuses to give ground when the pinned area and
    // the footer together want more room than the sheet's 92% allows, and the
    // save button is pushed off the bottom of the screen.
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.sm,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Color.border,
  },
});
