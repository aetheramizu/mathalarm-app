import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/*
        No header. The wake screen has to cover the entire window when the alarm
        fires — a navigation bar peeking above it would be a visible seam, and
        worse, a way to interact with the app without solving anything.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
      </Stack>
    </ThemeProvider>
  );
}
