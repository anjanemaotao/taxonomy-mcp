import { describe, it, expect } from 'vitest';
import { buildIndex } from '../src/taxonomy/index.js';
import { searchTopics, suggestSimilar } from '../src/taxonomy/search.js';
import { miniRaw } from './fixtures/mini.js';

const ix = buildIndex(miniRaw());

describe('searchTopics', () => {
  it('scores name matches above description matches', () => {
    const r = searchTopics(ix, { query: 'addition' });
    expect(r[0]!.id).toBe('C');
    expect(r[0]!.snippet).toContain('Addition to 10');
  });

  it('applies filters without a query, sorted by centrality', () => {
    expect(searchTopics(ix, { subject: 'Science' }).map((t) => t.id)).toEqual(['E']);
    expect(searchTopics(ix, {}).map((t) => t.id)).toEqual(['A', 'C', 'D', 'E', 'B']);
  });

  it('applies age filters on the range overlap rule', () => {
    expect(searchTopics(ix, { ageMax: 4 }).map((t) => t.id).sort()).toEqual(['A', 'B']);
    expect(searchTopics(ix, { ageMin: 6 }).map((t) => t.id).sort()).toEqual(['B', 'C', 'D', 'E']);
  });

  it('respects limit', () => {
    expect(searchTopics(ix, { limit: 2 })).toHaveLength(2);
  });
});

describe('suggestSimilar', () => {
  it('finds nearest names for a misspelled reference', () => {
    expect(suggestSimilar(ix, 'counting')[0]!.id).toBe('A');
    expect(suggestSimilar(ix, 'mt_bogus_id')).toEqual([]);
  });
});
