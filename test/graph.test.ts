import { describe, it, expect } from 'vitest';
import { buildIndex } from '../src/taxonomy/index.js';
import { prerequisitesOf, unlocksOf, summarize } from '../src/taxonomy/graph.js';
import { miniRaw } from './fixtures/mini.js';

const ix = buildIndex(miniRaw());

describe('prerequisitesOf', () => {
  it('returns direct prerequisites with reasons', () => {
    const r = prerequisitesOf(ix, 'C');
    expect(r.map((x) => x.id).sort()).toEqual(['A', 'B']);
    expect(r.find((x) => x.id === 'A')).toMatchObject({ strength: 'hard', reason: 'count before adding', depth: 1 });
  });

  it('filters by strength', () => {
    expect(prerequisitesOf(ix, 'C', { strength: 'hard' }).map((x) => x.id)).toEqual(['A']);
    expect(prerequisitesOf(ix, 'C', { strength: 'soft' }).map((x) => x.id)).toEqual(['B']);
  });

  it('walks transitively with depth', () => {
    const r = prerequisitesOf(ix, 'D', { transitive: true });
    expect(r.map((x) => x.id)).toEqual(['C', 'A', 'B']); // depth 1, then depth 2 by centrality
    expect(r.find((x) => x.id === 'A')!.depth).toBe(2);
  });

  it('transitive + hard follows only hard edges', () => {
    expect(prerequisitesOf(ix, 'D', { transitive: true, strength: 'hard' }).map((x) => x.id)).toEqual(['C', 'A']);
  });

  it('throws on unknown id', () => {
    expect(() => prerequisitesOf(ix, 'nope')).toThrow(/unknown topic/);
  });
});

describe('unlocksOf', () => {
  it('returns direct dependents', () => {
    expect(unlocksOf(ix, 'A').map((x) => x.id)).toEqual(['C']);
  });
  it('walks transitively', () => {
    expect(unlocksOf(ix, 'A', { transitive: true }).map((x) => x.id)).toEqual(['C', 'D']);
  });
});

describe('summarize', () => {
  it('carries the disambiguation fields', () => {
    const s = summarize(ix.byId.get('A')!);
    expect(s).toMatchObject({ id: 'A', name: 'Counting to 5', subject: 'Mathematics', ageRangeStart: 4, ageRangeEnd: 5 });
  });
});
