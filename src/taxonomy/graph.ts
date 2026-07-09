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

export interface SoftGap { prerequisite: TopicSummary; reason: string; }
export interface FrontierEntry extends TopicSummary { softGaps: SoftGap[]; }

export function frontierFor(
  ix: TaxonomyIndex, masteredIds: string[],
  opts: { subject?: string; ageMax?: number; limit?: number } = {},
): { frontier: FrontierEntry[]; totalCount: number; unknownMasteredIds: string[] } {
  const unknownMasteredIds = masteredIds.filter((id) => !ix.byId.has(id));
  const mastered = new Set(masteredIds);
  const entries: FrontierEntry[] = [];
  for (const t of ix.topics) {
    if (mastered.has(t.id)) continue;
    if (opts.subject !== undefined && t.subject !== opts.subject) continue;
    if (opts.ageMax !== undefined && t.ageRangeStart > opts.ageMax) continue;
    const edges = ix.prereqEdges.get(t.id)!;
    if (edges.some((e) => e.strength === 'hard' && !mastered.has(e.prerequisiteId))) continue;
    const softGaps = edges
      .filter((e) => e.strength === 'soft' && !mastered.has(e.prerequisiteId))
      .map((e) => ({ prerequisite: summarize(ix.byId.get(e.prerequisiteId)!), reason: e.reason }));
    entries.push({ ...summarize(t), softGaps });
  }
  entries.sort((a, b) => b.centrality - a.centrality);
  const limit = opts.limit ?? 100;
  return { frontier: entries.slice(0, limit), totalCount: entries.length, unknownMasteredIds };
}

export interface PathStep extends TopicSummary {
  requirement: 'required' | 'recommended' | 'goal';
  unlocksInPath: { id: string; name: string; strength: 'hard' | 'soft'; reason: string }[];
}

/** BFS upward from `startId`, following edges that pass `pred`, stopping at mastered topics. */
function ancestorsThrough(
  ix: TaxonomyIndex, startId: string, mastered: Set<string>,
  pred: (e: DependencyEdge) => boolean,
): Set<string> {
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const e of ix.prereqEdges.get(id)!) {
      if (!pred(e)) continue;
      const p = e.prerequisiteId;
      if (mastered.has(p) || seen.has(p)) continue;
      seen.add(p);
      stack.push(p);
    }
  }
  return seen;
}

export function pathTo(
  ix: TaxonomyIndex, goalId: string, masteredIds: string[] = [],
): { steps: PathStep[]; goalAlreadyMastered: boolean } {
  if (!ix.byId.has(goalId)) throw new Error(`unknown topic: ${goalId}`);
  const mastered = new Set(masteredIds);
  if (mastered.has(goalId)) return { steps: [], goalAlreadyMastered: true };

  const required = ancestorsThrough(ix, goalId, mastered, (e) => e.strength === 'hard');
  const all = ancestorsThrough(ix, goalId, mastered, () => true);
  const pathSet = new Set([...all, goalId]);

  const orderedIds = [...all].sort((a, b) => ix.topoRank.get(a)! - ix.topoRank.get(b)!);
  const step = (id: string, requirement: PathStep['requirement']): PathStep => ({
    ...summarize(ix.byId.get(id)!),
    requirement,
    unlocksInPath: ix.dependentEdges.get(id)!
      .filter((e) => pathSet.has(e.topicId))
      .map((e) => ({ id: e.topicId, name: ix.byId.get(e.topicId)!.name, strength: e.strength, reason: e.reason })),
  });

  const steps = orderedIds.map((id) => step(id, required.has(id) ? 'required' : 'recommended'));
  steps.push(step(goalId, 'goal'));
  return { steps, goalAlreadyMastered: false };
}
