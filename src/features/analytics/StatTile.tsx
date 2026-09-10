import { StyleSheet, Text, View } from 'react-native';

import { Color, Radius, Space } from '@/design/tokens';
import { FontFamily, Type } from '@/design/typography';

import { NO_VALUE } from './format';

type Props = {
  label: string;
  value: string;
  /** What the number is measured over or across. Optional, and never filler. */
  detail?: string;
};

/**
 * One number, its name, and how it was measured.
 *
 * A tile whose value is unavailable renders the dash in muted grey rather than
 * in the value colour, so an absent metric reads as absent at a glance instead
 * of as a result.
 */
export function StatTile({ label, value, detail }: Props) {
  const empty = value === NO_VALUE;

  return (
    <View style={styles.tile} accessibilityLabel={`${label}: ${empty ? 'no data' : value}`}>
      <Text style={Type.labelSm} numberOfLines={2}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.value, empty && styles.valueEmpty]} numberOfLines={1}>
        {value}
      </Text>
      {detail ? (
        <Text style={Type.bodySm} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The outcome breakdown, as one stacked bar.
 *
 * Built from plain views — `react-native-svg` is a native dependency, and this
 * is all the chart the data warrants. Every segment is also listed with its
 * count underneath, so the bar is a summary of the legend rather than the only
 * place the information exists.
 */
export function OutcomeBar({
  segments,
}: {
  segments: { label: string; count: number; color: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <View style={styles.breakdown}>
      <View
        style={styles.bar}
        accessibilityLabel={segments.map((s) => `${s.count} ${s.label}`).join(', ')}>
        {total === 0 ? (
          <View style={[styles.segment, styles.segmentEmpty]} />
        ) : (
          segments
            .filter((segment) => segment.count > 0)
            .map((segment) => (
              <View
                key={segment.label}
                style={[
                  styles.segment,
                  { flex: segment.count, backgroundColor: segment.color },
                ]}
              />
            ))
        )}
      </View>

      <View style={styles.legend}>
        {segments.map((segment) => (
          <View key={segment.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Text style={Type.bodySm} numberOfLines={1}>
              {segment.label} {segment.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: 2,
    padding: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: Color.cardElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  value: {
    fontFamily: FontFamily.monoBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: Color.textPrimary,
  },
  valueEmpty: {
    color: Color.textMuted,
  },
  breakdown: {
    gap: Space.sm,
  },
  bar: {
    flexDirection: 'row',
    height: 10,
    gap: 2,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  segmentEmpty: {
    flex: 1,
    backgroundColor: Color.cardElevated,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
});
