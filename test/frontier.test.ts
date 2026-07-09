import { describe, it, expect } from 'vitest';
import { buildIndex } from '../src/taxonomy/index.js';
import { loadData } from '../src/taxonomy/load.js';
import { frontierFor, pathTo } from '../src/taxonomy/graph.js';
import { miniRaw } from './fixtures/mini.js';

const ix = buildIndex(miniRaw());

describe('frontierFor (fixture)', () => {
  it('empty mastery -> topics with no hard prereqs, by centrality', () => {
    const { frontier, totalCount } = frontierFor(ix, []);
    expect(frontier.map((f) => f.id)).toEqual(['A', 'E', 'B']); // C,D blocked by hard prereqs
    expect(totalCount).toBe(3);
  });

  it('mastering A opens C with a soft gap on B', () => {
    const { frontier } = frontierFor(ix, ['A']);
    const c = frontier.find((f) => f.id === 'C');
    expect(c).toBeDefined();
    expect(c!.softGaps).toEqual([{ prerequisite: expect.objectContaining({ id: 'B' }), reason: 'songs build fluency' }]);
  });

  it('filters by subject and ageMax, reports unknown ids', () => {
    const r = frontierFor(ix, ['ghost'], { subject: 'Science' });
    expect(r.frontier.map((f) => f.id)).toEqual(['E']);
    expect(r.unknownMasteredIds).toEqual(['ghost']);
    expect(frontierFor(ix, [], { ageMax: 4 }).frontier.map((f) => f.id)).toEqual(['A', 'B']);
  });
});

describe('pathTo (fixture)', () => {
  it('orders required and recommended steps topologically', () => {
    const { steps } = pathTo(ix, 'D', ['A']);
    expect(steps.map((s) => [s.id, s.requirement])).toEqual([
      ['B', 'recommended'],
      ['C', 'required'],
      ['D', 'goal'],
    ]);
    const c = steps.find((s) => s.id === 'C')!;
    expect(c.unlocksInPath).toEqual([{ id: 'D', name: 'Subtraction to 10', strength: 'hard', reason: 'add before subtracting' }]);
  });

  it('handles a mastered goal and a fully mastered path', () => {
    expect(pathTo(ix, 'A', ['A']).goalAlreadyMastered).toBe(true);
    expect(pathTo(ix, 'D', ['A', 'B', 'C']).steps.map((s) => s.id)).toEqual(['D']);
  });
});

describe('real-data anchors', () => {
  const real = buildIndex(loadData());
  it('frontierFor([]) returns the audited 215 zero-hard-prereq topics', () => {
    expect(frontierFor(real, [], { limit: 1000 }).totalCount).toBe(215);
  });

  it('longest hard-prerequisite chain is the audited 25 topics', () => {
    // Depth over hard edges only, in topo order (prerequisites resolve first).
    const depth = new Map<string, number>();
    const ids = [...real.topoRank.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    for (const id of ids) {
      const hard = real.prereqEdges.get(id)!.filter((e) => e.strength === 'hard');
      depth.set(id, hard.length === 0 ? 0 : Math.max(...hard.map((e) => depth.get(e.prerequisiteId)!)) + 1);
    }
    expect(Math.max(...depth.values()) + 1).toBe(25);
  });
});
