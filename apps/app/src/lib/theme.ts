/**
 * The whole visual language, in one file.
 *
 * Not a design system - a short list of decisions made once so the screens stay
 * consistent. The bias throughout is legibility: this app gets used at 7am before
 * coffee, and by people older than me.
 */

export const colors = {
  // Dark ground, because the app opens on a camera and a bright chrome around a
  // viewfinder is unpleasant and hurts night use.
  background: '#0f172a',
  surface: '#1e293b',
  surfaceRaised: '#334155',
  border: '#475569',

  text: '#f8fafc',
  textMuted: '#94a3b8',
  textFaint: '#64748b',

  accent: '#38bdf8',
  accentText: '#0f172a',

  danger: '#f87171',
  success: '#4ade80',
  warning: '#fbbf24',
} as const;

/**
 * Blood-pressure category colours.
 *
 * An ordered severity scale, not a categorical palette: hue runs green to red the
 * way a clinician expects, and OKLCH lightness steps down monotonically
 * (0.669 / 0.629 / 0.585 / 0.544 / 0.502) so the ordering survives greyscale,
 * a dimmed screen, and colour-blindness. Adjacent steps are deliberately close -
 * that is what makes it a ramp - so these are *always* rendered beside their
 * written label. Never use one of these as the only signal.
 */
export const categoryColors = {
  normal: '#46ac71',
  elevated: '#af8000',
  hypertension_1: '#c45700',
  hypertension_2: '#c1382f',
  crisis: '#b42136',
} as const;

/**
 * The two chart series. Blue and magenta, checked against the dark chart surface
 * for colour-blind separation (worst-case protanopia dE 15.9, normal vision 26.5)
 * and held clear of the warm severity ramp above so a line is never mistaken for a
 * category band. Both are also direct-labelled on the chart.
 */
export const seriesColors = {
  systolic: '#3987e5',
  diastolic: '#d55181',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const type = {
  /** The three numbers on the confirm screen. Deliberately enormous. */
  reading: { fontSize: 56, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 26, fontWeight: '700' as const },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.6 },
  caption: { fontSize: 13, fontWeight: '400' as const },
} as const;

/** Apple's minimum is 44pt; everything tappable here meets or beats it. */
export const HIT_SIZE = 48;
