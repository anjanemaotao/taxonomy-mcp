import { TaxonomyDataError } from './load.js';
import type { Cluster, Curriculum, DependencyEdge, Manifest, RawData, StandardEntry, Topic } from './types.js';

export interface CatalogEntry {
  curriculum: { slug: string; name: string; textIncluded: boolean };
  entry: StandardEntry;
}

export interface TaxonomyIndex {
  topics: Topic[];
  byId: Map<string, Topic>;
  prereqEdges: Map<string, DependencyEdge[]>;
  dependentEdges: Map<string, DependencyEdge[]>;
  topoRank: Map<string, number>;
  standardsCatalog: Map<string, CatalogEntry>;
  standardToTopicIds: Map<string, string[]>;
  curricula: Curriculum[];
  clusters: Cluster[];
  subjects: string[];
  manifest: Manifest;
  stats: { hardEdges: number; softEdges: number; topicsWithStandards: number };
}

export function buildIndex(raw: RawData): TaxonomyIndex {
  const byId = new Map(raw.topics.map((t) => [t.id, t]));
  const prereqEdges = new Map<string, DependencyEdge[]>();
  const dependentEdges = new Map<string, DependencyEdge[]>();
  for (const t of raw.topics) {
    prereqEdges.set(t.id, []);
    dependentEdges.set(t.id, []);
  }
  let hardEdges = 0;
  for (const e of raw.dependencies) {
    prereqEdges.get(e.topicId)!.push(e);
    dependentEdges.get(e.prerequisiteId)!.push(e);
    if (e.strength === 'hard') hardEdges++;
  }

  // Kahn's algorithm: doubles as the cycle check.
  const indegree = new Map<string, number>();
  for (const t of raw.topics) indegree.set(t.id, prereqEdges.get(t.id)!.length);
  const queue = raw.topics.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    order.push(id);
    for (const e of dependentEdges.get(id)!) {
      const d = indegree.get(e.topicId)! - 1;
      indegree.set(e.topicId, d);
      if (d === 0) queue.push(e.topicId);
    }
  }
  if (order.length !== raw.topics.length) {
    throw new TaxonomyDataError(`dependency cycle detected: ${raw.topics.length - order.length} topics unsortable`);
  }
  const topoRank = new Map(order.map((id, i) => [id, i] as const));

  const standardsCatalog = new Map<string, CatalogEntry>();
  for (const cur of raw.curricula) {
    const meta = { slug: cur.slug, name: cur.name, textIncluded: cur.textIncluded };
    for (const s of cur.topics) standardsCatalog.set(s.key, { curriculum: meta, entry: s });
  }
  const standardToTopicIds = new Map<string, string[]>();
  let topicsWithStandards = 0;
  for (const t of raw.topics) {
    if (t.standards.length > 0) topicsWithStandards++;
    for (const k of t.standards) {
      const arr = standardToTopicIds.get(k) ?? [];
      arr.push(t.id);
      standardToTopicIds.set(k, arr);
    }
  }

  const subjects = [...new Set(raw.topics.map((t) => t.subject))].sort();

  return {
    topics: raw.topics, byId, prereqEdges, dependentEdges, topoRank,
    standardsCatalog, standardToTopicIds,
    curricula: raw.curricula, clusters: raw.clusters, subjects, manifest: raw.manifest,
    stats: { hardEdges, softEdges: raw.dependencies.length - hardEdges, topicsWithStandards },
  };
}
