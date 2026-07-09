import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cluster, Curriculum, DependencyEdge, Manifest, RawData, Topic } from './types.js';

export class TaxonomyDataError extends Error {}

// src/taxonomy/load.ts and dist/taxonomy/load.js are both two levels below the repo root.
export const DEFAULT_DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

function readJson(dir: string, file: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    throw new TaxonomyDataError(`Cannot read ${file}: ${(e as Error).message}`);
  }
}

function readBytes(dir: string, file: string): Buffer {
  try {
    return readFileSync(path.join(dir, file));
  } catch (e) {
    throw new TaxonomyDataError(`Cannot read ${file}: ${(e as Error).message}`);
  }
}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new TaxonomyDataError(msg);
}

export function loadData(dataDir: string = DEFAULT_DATA_DIR): RawData {
  const manifest = readJson(dataDir, 'manifest.json') as Manifest;

  for (const [file, meta] of Object.entries(manifest.files)) {
    const buf = readBytes(dataDir, file);
    check(buf.byteLength === meta.bytes, `${file}: size ${buf.byteLength} != manifest ${meta.bytes}`);
    const sha = createHash('sha256').update(buf).digest('hex');
    check(sha === meta.sha256, `${file}: sha256 mismatch vs manifest`);
  }

  const topics = (readJson(dataDir, 'topics.json') as { topics: Topic[] }).topics;
  const dependencies = (readJson(dataDir, 'dependencies.json') as { dependencies: DependencyEdge[] }).dependencies;
  const clusters = (readJson(dataDir, 'clusters.json') as { clusters: Cluster[] }).clusters;
  const curricula = (readJson(dataDir, 'curriculum-standards.json') as { curricula: Curriculum[] }).curricula;

  const c = manifest.counts;
  check(topics.length === c.topics, `topics: ${topics.length} != manifest ${c.topics}`);
  check(dependencies.length === c.dependencies, `dependencies: ${dependencies.length} != manifest ${c.dependencies}`);
  check(clusters.length === c.clusters, `clusters: ${clusters.length} != manifest ${c.clusters}`);
  check(curricula.length === c.curricula, `curricula: ${curricula.length} != manifest ${c.curricula}`);

  const ids = new Set(topics.map((t) => t.id));
  check(ids.size === topics.length, 'duplicate topic ids');
  for (const t of topics) {
    check(t.assessmentPrompt.length > 0, `topic ${t.id} has no assessmentPrompt`);
    check(typeof t.name === 'string' && t.name.length > 0, `topic ${t.id} has invalid name`);
    check(typeof t.subject === 'string' && t.subject.length > 0, `topic ${t.id} has invalid subject`);
    check(typeof t.domain === 'string' && t.domain.length > 0, `topic ${t.id} has invalid domain`);
    check(Number.isFinite(t.ageRangeStart) && Number.isFinite(t.ageRangeEnd), `topic ${t.id} has invalid age range`);
    check(Number.isFinite(t.centrality), `topic ${t.id} has invalid centrality`);
  }
  for (const d of dependencies) {
    check(ids.has(d.topicId), `edge references unknown topicId ${d.topicId}`);
    check(ids.has(d.prerequisiteId), `edge references unknown prerequisiteId ${d.prerequisiteId}`);
    check(d.strength === 'hard' || d.strength === 'soft', `edge ${d.topicId}<-${d.prerequisiteId}: bad strength`);
  }

  const catalogKeys = new Set<string>();
  let catalogSize = 0;
  for (const cur of curricula) for (const s of cur.topics) { catalogKeys.add(s.key); catalogSize++; }
  check(catalogSize === c.curriculumStandards, `standards catalog: ${catalogSize} != manifest ${c.curriculumStandards}`);
  let linkCount = 0;
  for (const t of topics) for (const k of t.standards) {
    check(catalogKeys.has(k), `topic ${t.id} references unknown standard ${k}`);
    linkCount++;
  }
  check(linkCount === c.topicStandardLinks, `standard links: ${linkCount} != manifest ${c.topicStandardLinks}`);

  return { topics, dependencies, clusters, curricula, manifest };
}
