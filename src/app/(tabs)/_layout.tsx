import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Color, Layout, Space } from '@/design/tokens';
import { FontFamily } from '@/design/typography';

/**
 * The three sections of v1: Alarms, Analytics, Settings.
 *
 * There is deliberately no Challenge tab. The challenge is the full-screen
 * `wake` route that takes over the device when an alarm fires, and it lives
 * outside this group.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  /**
   * Android has drawn apps edge to edge since SDK 54, and on Android 16 it is
   * no longer optional — the window extends underneath the gesture pill or the
   * three-button bar, and nothing pads it back automatically.
   *
   * Pinning `height` to a constant is what breaks this: it wins over the height
   * react-navigation would otherwise derive from the insets, so on a
   * gesture-navigation phone the labels sit inside the swipe-up area and on a
   * three-button phone the whole bar is buried. The bar is therefore as tall as
   * its own content *plus* whatever the system claims below it, with that
   * claimed strip added as padding so the icons stay above it.
   *
   * The strip is painted in the app's own void, and the plugin turns off
   * Android's contrast scrim (`enforceContrast: false` in `app.json`), so the
   * system navigation area reads as part of the tab bar rather than as a band
   * bolted onto the bottom of it.
   */
  const barHeight = Layout.tabBar + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Color.magentaText,
        tabBarInactiveTintColor: Color.textSecondary,
        tabBarStyle: [styles.bar, { height: barHeight, paddingBottom: insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: Color.void },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Alarms',
          tabBarIcon: ({ color, size }) => <MaterialIcons name="alarm" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="insights" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Color.void,
    borderTopColor: Color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs,
  },
  label: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  item: {
    paddingVertical: Space.xxs,
  },
});
