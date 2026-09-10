import type { TextStyle } from 'react-native';

import { Color } from './tokens';

/**
 * Geist carries language, JetBrains Mono carries numbers.
 *
 * The split is not decoration: monospaced digits are tabular, so a ticking
 * countdown or a running solve timer does not jitter sideways as its glyphs
 * change. Every clock, equation, countdown and metric readout uses the mono
 * family for that reason.
 *
 * React Native has no synthetic weights on Android — a `fontWeight` that has no
 * matching file is silently ignored — so each weight is its own family name.
 */
export const FontFamily = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemiBold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/**
 * `letterSpacing` is in points here, not ems as in the source design, so the
 * em values from the reference are multiplied through by their font size.
 */
export const Type = {
  /** The alarm clock face. */
  displayAlarm: {
    fontFamily: FontFamily.monoBold,
    fontSize: 48,
    lineHeight: 54,
    letterSpacing: -1.4,
    color: Color.textPrimary,
  },
  /** The equation on the wake screen. */
  displayEquation: {
    fontFamily: FontFamily.monoBold,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: -1.7,
    color: Color.textPrimary,
  },
  headlineLg: {
    fontFamily: FontFamily.sansBold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.6,
    color: Color.textPrimary,
  },
  headlineMd: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.35,
    color: Color.textPrimary,
  },
  headlineSm: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 20,
    lineHeight: 28,
    color: Color.textPrimary,
  },
  titleLg: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 18,
    lineHeight: 24,
    color: Color.textPrimary,
  },
  bodyLg: {
    fontFamily: FontFamily.sans,
    fontSize: 16,
    lineHeight: 24,
    color: Color.textPrimary,
  },
  bodyMd: {
    fontFamily: FontFamily.sans,
    fontSize: 14,
    lineHeight: 20,
    color: Color.textSecondary,
  },
  bodySm: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
    color: Color.textSecondary,
  },
  /** Technical micro-labels: uppercase, widely tracked, monospaced. */
  labelLg: {
    fontFamily: FontFamily.monoSemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.6,
    color: Color.textSecondary,
  },
  labelMd: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: Color.textSecondary,
  },
  labelSm: {
    fontFamily: FontFamily.monoMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    color: Color.textSecondary,
  },
} satisfies Record<string, TextStyle>;
