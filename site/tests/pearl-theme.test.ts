import {describe, expect, it} from 'vitest';
import {defaultPearlTheme, pearlThemeStyle} from '../src/lib/pearl/theme';

describe('Pearl theme CSS contract', () => {
  it('normalizes valid Directus hex colours before rendering', () => {
    const style = pearlThemeStyle({...defaultPearlTheme, primary_color: '#855D56'});
    expect(style).toContain('--pearl-primary:#855d56');
  });

  it('falls back safely when a colour is not a six-digit hex value', () => {
    const style = pearlThemeStyle({...defaultPearlTheme, primary_color: 'red'});
    expect(style).toContain(`--pearl-primary:${defaultPearlTheme.primary_color}`);
    expect(style).not.toContain('--pearl-primary:red');
  });

  it('supports source-faithful Playfair and Jost typography tokens', () => {
    const style = pearlThemeStyle({
      ...defaultPearlTheme,
      heading_font: 'playfair',
      body_font: 'jost',
      heading_scale: 'source-faithful',
      body_scale: 'large',
      heading_line_height: 'relaxed',
      body_line_height: 'source-faithful',
    });
    expect(style).toContain("--pearl-font-heading:'Playfair Display', Georgia, serif");
    expect(style).toContain('--pearl-size-h1-max:65px');
    expect(style).toContain('--pearl-size-h2-max:40px');
    expect(style).toContain('--pearl-size-h3-max:30px');
    expect(style).toContain('--pearl-size-body:20px');
    expect(style).toContain('--pearl-leading-body:1.6');
  });
});
