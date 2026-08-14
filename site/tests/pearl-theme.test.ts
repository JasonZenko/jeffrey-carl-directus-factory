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
});
