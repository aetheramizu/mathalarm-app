/**
 * Palette for the alarm spike rig.
 *
 * Deliberately not the app's theme. This screen is a piece of test equipment,
 * not product UI, and it reads like one: near-black chassis, hairline rules,
 * monospace everywhere, one amber accent doing all the signalling. It commits
 * to dark because the thing it tests gets used at 3am, and it looks nothing
 * like the real app so there is never a moment of confusion about which is
 * which.
 */
export const Rig = {
  chassis: '#08090A',
  panel: '#0F1113',
  panelRaised: '#16191C',
  line: '#23282D',

  text: '#E7EAED',
  dim: '#6C757D',

  /** The signal colour. Used sparingly — it means "this matters". */
  amber: '#F5A524',
  ok: '#4ADE80',
  alert: '#FF5A47',
} as const;

export const Mono = 'monospace';
