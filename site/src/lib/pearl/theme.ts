export interface PearlTheme {
  brand_name: string;
  brand_descriptor?: string;
  heading_font: 'forum' | 'jost' | 'georgia';
  body_font: 'jost' | 'arial' | 'georgia';
  h1_weight: '400' | '500' | '600' | '700';
  h2_weight: '400' | '500' | '600' | '700';
  h3_weight: '400' | '500' | '600' | '700';
  body_weight: '400' | '500' | '600';
  heading_scale: 'restrained' | 'standard' | 'expressive';
  body_scale: 'compact' | 'standard' | 'large';
  heading_line_height: 'tight' | 'standard' | 'relaxed';
  body_line_height: 'compact' | 'standard' | 'relaxed';
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  ink_color: string;
  muted_color: string;
  surface_color: string;
  circle_color: string;
  spacing_scale: 'compact' | 'standard' | 'generous';
  content_width: 'standard' | 'wide';
  button_radius: 'square' | 'soft' | 'pill';
  appointment_label?: string;
  appointment_url?: string;
  phone?: string;
  address?: string;
  email?: string;
}

export const defaultPearlTheme: PearlTheme = {
  brand_name: 'Pearl',
  brand_descriptor: 'Dentistry',
  heading_font: 'forum',
  body_font: 'jost',
  h1_weight: '400',
  h2_weight: '400',
  h3_weight: '500',
  body_weight: '400',
  heading_scale: 'standard',
  body_scale: 'standard',
  heading_line_height: 'standard',
  body_line_height: 'standard',
  primary_color: '#855d56',
  secondary_color: '#e1e9f3',
  accent_color: '#526273',
  ink_color: '#111111',
  muted_color: '#53606d',
  surface_color: '#ffffff',
  circle_color: '#526273',
  spacing_scale: 'standard',
  content_width: 'standard',
  button_radius: 'square',
  appointment_label: 'Request appointment',
  appointment_url: '#contact',
};

const FONT_STACK = {
  forum: "'Forum', Georgia, serif",
  jost: "'Jost', Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  arial: "Arial, Helvetica, sans-serif",
} as const;

const HEADING_SCALE = {
  restrained: ['4.6rem', '3.2rem', '1.55rem'],
  standard: ['5.5rem', '3.8rem', '1.7rem'],
  expressive: ['6rem', '4.4rem', '1.9rem'],
} as const;
const BODY_SCALE = { compact: '16px', standard: '18px', large: '20px' } as const;
const HEADING_LINE_HEIGHT = { tight: '1', standard: '1.1', relaxed: '1.2' } as const;
const BODY_LINE_HEIGHT = { compact: '1.5', standard: '1.65', relaxed: '1.8' } as const;
const SPACING = { compact: '.82', standard: '1', generous: '1.18' } as const;
const WIDTH = { standard: '1170px', wide: '1320px' } as const;
const RADIUS = { square: '0px', soft: '8px', pill: '999px' } as const;
const HEX = /^#[0-9a-f]{6}$/i;

export function pearlThemeStyle(theme: PearlTheme): string {
  const safeColor = (value: string, fallback: string) => HEX.test(value) ? value : fallback;
  const scale = HEADING_SCALE[theme.heading_scale];
  const values: Record<string, string> = {
    'font-heading': FONT_STACK[theme.heading_font],
    'font-body': FONT_STACK[theme.body_font],
    'weight-h1': theme.h1_weight,
    'weight-h2': theme.h2_weight,
    'weight-h3': theme.h3_weight,
    'weight-body': theme.body_weight,
    'size-h1-max': scale[0],
    'size-h2-max': scale[1],
    'size-h3-max': scale[2],
    'size-body': BODY_SCALE[theme.body_scale],
    'leading-heading': HEADING_LINE_HEIGHT[theme.heading_line_height],
    'leading-body': BODY_LINE_HEIGHT[theme.body_line_height],
    primary: safeColor(theme.primary_color, defaultPearlTheme.primary_color),
    secondary: safeColor(theme.secondary_color, defaultPearlTheme.secondary_color),
    accent: safeColor(theme.accent_color, defaultPearlTheme.accent_color),
    ink: safeColor(theme.ink_color, defaultPearlTheme.ink_color),
    muted: safeColor(theme.muted_color, defaultPearlTheme.muted_color),
    surface: safeColor(theme.surface_color, defaultPearlTheme.surface_color),
    circle: safeColor(theme.circle_color, defaultPearlTheme.circle_color),
    forest: safeColor(theme.accent_color, defaultPearlTheme.accent_color),
    'forest-deep': safeColor(theme.ink_color, defaultPearlTheme.ink_color),
    moss: safeColor(theme.primary_color, defaultPearlTheme.primary_color),
    maroon: safeColor(theme.primary_color, defaultPearlTheme.primary_color),
    light: safeColor(theme.secondary_color, defaultPearlTheme.secondary_color),
    white: safeColor(theme.surface_color, defaultPearlTheme.surface_color),
    spacing: SPACING[theme.spacing_scale],
    wrap: WIDTH[theme.content_width],
    'button-radius': RADIUS[theme.button_radius],
  };
  return Object.entries(values).map(([name, value]) => `--pearl-${name}:${value}`).join(';');
}
