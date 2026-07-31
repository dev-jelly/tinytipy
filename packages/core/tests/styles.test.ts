import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('canonical styles', () => {
  it('overlaps reserve candidates so the root uses their maximum size', () => {
    expect(styles).toMatch(/\.tm-reserve\s*\{[^}]*display:\s*grid;/s);
    expect(styles).toMatch(
      /\.tm-reserve\s*>\s*span\s*\{[^}]*grid-area:\s*1\s*\/\s*1;/s,
    );
  });

  it('uses a zero-width anchor and absolutely positioned overlay caret', () => {
    expect(styles).toMatch(/\.tm-cursor\s*\{[^}]*width:\s*0;/s);
    expect(styles).toMatch(/\.tm-cursor::after\s*\{[^}]*position:\s*absolute;/s);
  });

  it('preserves the legacy space-consuming inline cursor', () => {
    expect(styles).toMatch(
      /\[data-cursor-layout="inline"\] \.tm-cursor\s*\{[^}]*width:\s*clamp\([^;]+;[^}]*margin-left:\s*0\.04em;/s,
    );
  });

  it('keeps inherited color, blinking, and reduced-motion suppression', () => {
    expect(styles).toContain('background-color: currentColor');
    expect(styles).toContain('animation: tm-blink 1s steps(1, end) infinite');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.tm-cursor::after,[\s\S]*animation:\s*none;/,
    );
  });
});
