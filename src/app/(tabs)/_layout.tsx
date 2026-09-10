import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Color.magentaText,
        tabBarInactiveTintColor: Color.textSecondary,
        tabBarStyle: styles.bar,
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
    height: Layout.tabBar,
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
