import { StyleSheet, Text, View } from 'react-native';

import { Color, Space } from '@/design/tokens';
import { Type } from '@/design/typography';

type Props = {
  title: string;
  /** The phase that replaces this screen, so the shell is never mistaken for the app. */
  arrivesIn: string;
};

/**
 * Temporary scaffolding for the P0 shell. Each of these is deleted the moment
 * its phase lands; nothing else should ever depend on it.
 */
export function Placeholder({ title, arrivesIn }: Props) {
  return (
    <View style={styles.root}>
      <Text style={Type.labelSm}>MATHALARM</Text>
      <Text style={[Type.headlineLg, styles.title]}>{title}</Text>
      <View style={styles.note}>
        <Text style={Type.labelMd}>{arrivesIn}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xs,
  },
  title: {
    marginBottom: Space.md,
  },
  note: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: 999,
    backgroundColor: Color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
});
