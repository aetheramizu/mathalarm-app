/**
 * The MathAlarm design tokens.
 *
 * Adapted from the Stitch "Cyber Chrono" prototype, which is a visual reference
 * rather than a specification. The neon palette and the dark ground are kept;
 * the web-only techniques behind them (backdrop blur, CSS glow) are not, and
 * are approximated with layered translucent fills where they earn their place.
 */

export const Color = {
  /** Layer 0. Pure enough to save power on OLED and not glare at 3am. */
  void: '#09090E',
  /** Layer 0.5 — used for sheets and anything sitting on top of the void. */
  surface: '#12121C',
  /** Layer 1 — cards. */
  card: '#1A1A24',
  /** Layer 2 — controls inside a card, pressed states, keypad keys. */
  cardElevated: '#242432',

  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  textPrimary: '#FFFFFF',
  textSecondary: '#A5A5B8',
  /** Only for text that is decoration, never for information. */
  textMuted: '#6E6E80',

  /** Primary accent. Large text and fills only — see `magentaText`. */
  magenta: '#FF2E93',
  /**
   * #FF2E93 lands near 4.6:1 on the void, which passes for large text and
   * fails for the 10-12px labels this design leans on. Small magenta text uses
   * this lighter tint instead.
   */
  magentaText: '#FF6FB2',
  cyan: '#00F0FF',
  purple: '#7B2CBF',
  peach: '#FFA07A',
  danger: '#FF5A5F',

  magentaFill: 'rgba(255, 46, 147, 0.15)',
  magentaEdge: 'rgba(255, 46, 147, 0.40)',
  cyanFill: 'rgba(0, 240, 255, 0.12)',
  cyanEdge: 'rgba(0, 240, 255, 0.35)',
} as const;

/** The gradient that carries every primary action. */
export const PrimaryGradient = [Color.peach, Color.magenta, Color.purple] as const;

export const Space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  /** Cards, sheets, dial housings. */
  lg: 20,
  pill: 999,
} as const;

export const Layout = {
  /** Single outer gutter for every screen. */
  screenPadding: Space.lg,
  /** Android's minimum touch target. */
  minTouch: 48,
  /**
   * The wake screen is operated half-asleep, so its keys are deliberately
   * larger than the platform minimum.
   */
  wakeKey: 64,
  /**
   * The tab bar's own height, excluding the gesture inset below it. Screens add
   * this plus that inset to their scroll padding so the last row is never
   * trapped underneath the bar.
   */
  tabBar: 68,
} as const;
