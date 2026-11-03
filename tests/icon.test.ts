import { describe, expect, it } from 'vitest';
import {
  defaultIconColor,
  defaultIconLetter,
  ICON_PALETTE,
  iconDataUrl,
  iconSvg,
  letterColorFor,
  resolveIconStyle,
} from '@/lib/icon';

describe('tab icons', () => {
  it('gives each sub-account a stable colour from the palette', () => {
    const color = defaultIconColor('LocAbc123XyZ456DefGh');
    expect(ICON_PALETTE).toContain(color);
    expect(defaultIconColor('LocAbc123XyZ456DefGh')).toBe(color);
    // Different sub-accounts usually differ.
    const colors = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map(defaultIconColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('uses the first letter or digit of the name', () => {
    expect(defaultIconLetter('Acme Training')).toBe('A');
    expect(defaultIconLetter('  acme')).toBe('A');
    expect(defaultIconLetter('123 Fitness')).toBe('1');
    expect(defaultIconLetter('élan Studio')).toBe('É');
    expect(defaultIconLetter('')).toBe('?');
    expect(defaultIconLetter(null)).toBe('?');
  });

  it("applies the user's letter and colour, ignoring invalid values", () => {
    expect(resolveIconStyle('loc1', 'Acme Training', { letter: 'at', color: '#123ABC' })).toEqual({
      letter: 'AT',
      color: '#123abc',
    });
    const fallback = resolveIconStyle('loc1', 'Acme Training', { letter: '  ', color: 'red' });
    expect(fallback.letter).toBe('A');
    expect(fallback.color).toBe(defaultIconColor('loc1'));
    expect(resolveIconStyle('loc1', 'Acme', { letter: 'ABC' }).letter).toBe('AB');
  });

  it('picks a readable letter colour', () => {
    expect(letterColorFor('#0d9488')).toBe('#ffffff');
    expect(letterColorFor('#1e293b')).toBe('#ffffff');
    expect(letterColorFor('#fde047')).toBe('#111111');
    expect(letterColorFor('#ffffff')).toBe('#111111');
  });

  it('builds an SVG with the colour and an escaped letter', () => {
    const svg = iconSvg({ letter: 'A', color: '#0d9488' });
    expect(svg).toContain('fill="#0d9488"');
    expect(svg).toContain('>A</text>');
    expect(svg).toContain('font-size="21"');
    expect(iconSvg({ letter: 'AT', color: '#0d9488' })).toContain('font-size="15"');
    expect(iconSvg({ letter: '<', color: '#0d9488' })).toContain('>&#60;</text>');
    const url = iconDataUrl({ letter: 'A', color: '#0d9488' });
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(url.slice('data:image/svg+xml,'.length))).toBe(svg);
  });
});
