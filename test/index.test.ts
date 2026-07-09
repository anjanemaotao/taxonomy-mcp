import { describe, it, expect } from 'vitest';
import { buildIndex } from '../src/taxonomy/index.js';
import { loadData, TaxonomyDataError } from '../src/taxonomy/load.js';
import { miniRaw, MINI_EDGES } from './fixtures/mini.js';

describe('buildIndex (fixture)', () => {
  const ix = buildIndex(miniRaw());

  it('builds adjacency both directions', () => {
    expect(ix.prereqEdges.get('C')).toHaveLength(2);
    expect(ix.prereqEdges.get('A')).toHaveLength(0);
    expect(ix.dependentEdges.get('A')!.map((e) => e.topicId)).toEqual(['C']);
  });

  it('topo rank puts prerequisites before dependents', () => {
    expect(ix.topoRank.get('A')!).toBeLessThan(ix.topoRank.get('C')!);
    expect(ix.topoRank.get('C')!).toBeLessThan(ix.topoRank.get('D')!);
  });

  it('joins the standards catalog both ways', () => {
    expect(ix.standardsCatalog.get('ccss-math:K.CC.A.1')!.entry.data.title).toBe('Count to 100');
    expect(ix.standardToTopicIds.get('ccss-math:K.CC.A.1')).toEqual(['A']);
  });

  it('throws on a cycle', () => {
    const cyclic = miniRaw({ dependencies: [...MINI_EDGES, { topicId: 'A', prerequisiteId: 'D', strength: 'hard', reason: 'cycle' }] });
    expect(() => buildIndex(cyclic)).toThrow(TaxonomyDataError);
    expect(() => buildIndex(cyclic)).toThrow(/cycle/i);
  });
});

describe('buildIndex (real data anchors)', () => {
  const ix = buildIndex(loadData());

  it('matches the audited shape', () => {
    expect(ix.topics.length).toBe(1590);
    expect(ix.stats.hardEdges).toBe(2025);
    expect(ix.stats.softEdges).toBe(1196);
    expect(ix.stats.topicsWithStandards).toBe(818);
    expect(ix.subjects).toHaveLength(8);
    expect(ix.topoRank.size).toBe(1590);
  });
});
