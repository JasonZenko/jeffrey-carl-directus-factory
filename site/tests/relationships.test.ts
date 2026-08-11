import { describe, expect, it } from 'vitest';
import { htmlToText, pages, templates } from './helpers';

describe('structural relationships', () => {
  it('template blueprints cover every block type used by their family', () => {
    for (const page of pages) {
      const template = templates.find((t) => t.slug === page.template);
      expect(template, page.template).toBeDefined();
      const allowed = new Set(template!.blocks.map((b) => b.component_type));
      for (const block of page.blocks) {
        expect(allowed, `${block.id} (${block.type}) not in ${page.template} blueprint`).toContain(block.type);
      }
    }
  });

  it('blocks group contiguously by source article band, preserving band order', () => {
    for (const page of pages) {
      const sequence = page.blocks.map((b) => b.article_id);
      const transitions: string[] = [];
      for (const id of sequence) {
        if (transitions[transitions.length - 1] !== id) transitions.push(id);
      }
      // Once a band closes it never reopens.
      expect(new Set(transitions).size, page.legacy_path).toBe(transitions.length);
      // Band indices are monotonically non-decreasing.
      const bandOrder = transitions.map((id) => Number(id.replace('ArtID', '')));
      expect([...bandOrder].sort((a, b) => a - b), page.legacy_path).toEqual(bandOrder);
    }
  });

  it('article text reconstructs from ordered blocks (concatenation fidelity)', () => {
    for (const page of pages) {
      const bands = new Map<string, string[]>();
      for (const block of page.blocks) {
        const list = bands.get(block.article_id) ?? [];
        list.push(block.html);
        bands.set(block.article_id, list);
      }
      const full = [...bands.values()].map((fragments) => htmlToText(fragments.join('')));
      // No empty bands, and the join of bands equals the join of all blocks.
      for (const text of full) expect(text.length).toBeGreaterThan(0);
      const flat = htmlToText(page.blocks.map((b) => b.html).join(''));
      expect(flat).toBe(full.join(' '));
    }
  });
});
