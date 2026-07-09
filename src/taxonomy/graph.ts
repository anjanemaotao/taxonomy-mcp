import type { TaxonomyIndex } from './index.js';
import type { DependencyEdge, Topic, TopicType } from './types.js';

export interface TopicSummary {
  id: string; name: string; subject: string; domain: string; type: TopicType;
  ageRangeStart: number; ageRangeEnd: number; centrality: number;
}

export function summarize(t: Topic): TopicSummary {
  return {
    id: t.id, name: t.name, subject: t.subject, domain: t.domain, type: t.type,
    ageRangeStart: t.ageRangeStart, ageRangeEnd: t.ageRangeEnd,
    centrality: Math.round(t.centrality * 1000) / 1000,
  };
}

export interface RelatedTopic extends TopicSummary { strength: 'hard' | 'soft'; reason: string; depth: number; }
export type StrengthFilter = 'hard' | 'soft' | 'all';

function requireKnown(ix: TaxonomyIndex, id: string): void {
  if (!ix.byId.has(id)) throw new Error(`unknown topic: ${id}`);
}

function matches(e: DependencyEdge, strength: StrengthFilter): boolean {
  return strength === 'all' || e.strength === strength;
}

/** BFS over edges in one direction; `next` maps an edge to the neighbor id. */
function walk(
  ix: TaxonomyIndex,
  startId: string,
  edgesOf: (id: string) => DependencyEdge[],
  next: (e: DependencyEdge) => string,
  transitive: boolean,
  strength: StrengthFilter,
): RelatedTopic[] {
  const found = new Map<string, RelatedTopic>();
  let frontier = [startId];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const e of edgesOf(id)) {
        if (!matches(e, strength)) continue;
        const nb = next(e);
        if (nb === startId || found.has(nb)) continue;
        found.set(nb, { ...summarize(ix.byId.get(nb)!), strength: e.strength, reason: e.reason, depth });
        nextFrontier.push(nb);
      }
    }
    if (!transitive) break;
    frontier = nextFrontier;
  }
  return [...found.values()].sort((a, b) => a.depth - b.depth || b.centrality - a.centrality);
}

export function prerequisitesOf(
  ix: TaxonomyIndex, id: string,
  opts: { transitive?: boolean; strength?: StrengthFilter } = {},
): RelatedTopic[] {
  requireKnown(ix, id);
  return walk(ix, id, (i) => ix.prereqEdges.get(i)!, (e) => e.prerequisiteId, opts.transitive ?? false, opts.strength ?? 'all');
}

export function unlocksOf(
  ix: TaxonomyIndex, id: string,
  opts: { transitive?: boolean } = {},
): RelatedTopic[] {
  requireKnown(ix, id);
  return walk(ix, id, (i) => ix.dependentEdges.get(i)!, (e) => e.topicId, opts.transitive ?? false, 'all');
}
