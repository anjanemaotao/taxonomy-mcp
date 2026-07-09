# taxonomy-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server exposing Marble's os-taxonomy curriculum graph (1,590 topics, 3,221 prerequisite edges) as 9 read-only tools + resources, over stdio locally and streamable HTTP in Docker, ready for droplet deploy.

**Architecture:** Vendored JSON loaded at boot into an in-memory index (id map, hard/soft adjacency both directions, Kahn topo order, standards catalog join). Pure graph functions with no MCP imports; thin zod-validated tool handlers; one `McpServer` factory shared by a stdio entry and a stateless Express streamable-HTTP entry.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Node >= 22, `@modelcontextprotocol/sdk` ^1.27, `zod` ^3.25, `express` ^4.21, `vitest`, `tsx`, Docker (node:24-alpine), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-09-taxonomy-mcp-design.md`. Read it before starting. Its "Verified data facts" section is the source of truth for all data assumptions and test anchors.

## Global Constraints

- ESM + NodeNext: every relative import in `src/` and `test/` uses a `.js` extension (`import { loadData } from './load.js'`).
- stdio transport reserves stdout for the protocol: all logging everywhere uses `console.error`, never `console.log`.
- Zero runtime secrets and zero runtime network calls; the server must boot from `data/` alone.
- Boot fails loudly: any data validation failure throws before a transport connects.
- All tool outputs that reference a topic include id + subject + age range (21 topic names are duplicated).
- Absence of standards/evidence/clusters is stated as fact in output text, never as an error.
- Commit messages: imperative, no co-author lines, no emoji.
- Markdown files: each full sentence on its own line. No em dashes anywhere (use "-").
- `data/` files are only ever changed by `scripts/update-data.ts` followed by a human-reviewed commit.

---

### Task 1: Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `dev:http`, `build`, `start`, `typecheck`, `test`, `update-data` used by every later task.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "taxonomy-mcp",
  "version": "1.0.0",
  "description": "MCP server for Marble's open skill taxonomy (os-taxonomy): curriculum knowledge graph tools for AI agents",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "tsx src/stdio.ts",
    "dev:http": "tsx src/http.ts",
    "build": "tsc",
    "start": "node dist/http.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "update-data": "tsx scripts/update-data.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "express": "^4.21.2",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^24.0.0",
    "ajv": "^8.17.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

Note: `test/` and `scripts/` are excluded from the build on purpose; vitest and tsx run them directly.
`typecheck` covers `src/` only; that is acceptable because tests fail loudly at runtime under vitest.

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
*.log
```

- [ ] **Step 4: Install and verify**

Run: `npm install && npm run typecheck`
Expected: install succeeds; typecheck exits 0 (no inputs yet is fine - if tsc errors with "No inputs were found", create an empty `src/placeholder.ts` containing `export {};` and re-run; it is deleted in Task 3).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/placeholder.ts 2>/dev/null; git add -A
git commit -m "Scaffold TypeScript ESM project"
```

---

### Task 2: Vendor upstream data

**Files:**
- Create: `data/topics.json`, `data/dependencies.json`, `data/clusters.json`, `data/curriculum-standards.json`, `data/manifest.json`, `data/schema/*.schema.json`, `data/UPSTREAM.md`

**Interfaces:**
- Produces: the `data/` directory every later task reads. `data/UPSTREAM.md` records upstream commit + attribution.

- [ ] **Step 1: Clone upstream and copy files**

```bash
git clone --depth 1 https://github.com/withmarbleapp/os-taxonomy /tmp/os-taxonomy-vendor
mkdir -p data/schema
cp /tmp/os-taxonomy-vendor/data/*.json data/
cp /tmp/os-taxonomy-vendor/schema/*.schema.json data/schema/
UPSTREAM_COMMIT=$(git -C /tmp/os-taxonomy-vendor rev-parse HEAD)
echo "upstream commit: $UPSTREAM_COMMIT"
```

- [ ] **Step 2: Write data/UPSTREAM.md** (substitute the real commit hash and today's date)

```markdown
# Upstream provenance

This directory vendors the Marble Skill Taxonomy.

- Source: https://github.com/withmarbleapp/os-taxonomy
- Upstream commit: <UPSTREAM_COMMIT>
- Vendored on: <YYYY-MM-DD>
- Taxonomy version: v1

## Attribution and license

The taxonomy is (c) Marble (Generative Spark, Inc.), https://withmarble.com.
Database structure licensed under ODbL 1.0; authored content under CC BY-SA 4.0.
This project uses the data with attribution and does not modify it.
Refresh only via `npm run update-data`.
```

- [ ] **Step 3: Verify sha256 integrity against the manifest**

Run:

```bash
node -e '
const fs = require("fs"), crypto = require("crypto");
const m = JSON.parse(fs.readFileSync("data/manifest.json"));
let fail = 0;
for (const [f, meta] of Object.entries(m.files)) {
  const buf = fs.readFileSync("data/" + f);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  if (sha !== meta.sha256 || buf.length !== meta.bytes) { console.error("MISMATCH", f); fail = 1; }
  else console.error("ok", f);
}
process.exit(fail);'
```

Expected: `ok` for every file listed in the manifest, exit 0.

- [ ] **Step 4: Commit**

```bash
git add data/
git commit -m "Vendor os-taxonomy v1 data with provenance and schemas"
```

---

### Task 3: Types and validated loader

**Files:**
- Create: `src/taxonomy/types.ts`, `src/taxonomy/load.ts`
- Test: `test/load.test.ts`
- Delete: `src/placeholder.ts` if it exists.

**Interfaces:**
- Produces:
  - `types.ts`: `Topic`, `TopicType`, `DependencyEdge`, `Cluster`, `Curriculum`, `StandardEntry`, `Manifest`, `RawData`.
  - `load.ts`: `loadData(dataDir?: string): RawData` (throws `TaxonomyDataError` on any problem), `DEFAULT_DATA_DIR: string`, `class TaxonomyDataError extends Error`.

- [ ] **Step 1: Write src/taxonomy/types.ts**

```typescript
export type TopicType = 'CONCEPTUAL' | 'LANGUAGE' | 'META' | 'PROCEDURAL' | 'REPRESENTATIONAL';

export interface Topic {
  id: string;
  type: TopicType;
  subject: string;
  domain: string;
  name: string;
  description: string;
  ageRangeStart: number;
  ageRangeEnd: number;
  centrality: number;
  evidence: string[];
  assessmentPrompt: string;
  standards: string[];
}

export interface DependencyEdge {
  topicId: string;         // the topic that HAS the prerequisite
  prerequisiteId: string;  // the prerequisite topic
  strength: 'hard' | 'soft';
  reason: string;
}

export interface Cluster {
  subject: string;
  domain: string;
  ageRangeStart: number;
  summary: string;
}

export interface StandardEntry {
  key: string;   // "<curriculum-slug>:<code>", e.g. "ccss-ela:L.K.1f"
  code: string;
  data: { title?: string; description?: string; subject?: string; domain?: string; [k: string]: unknown };
}

export interface Curriculum {
  slug: string;
  name: string;
  country?: string;
  license?: string;
  sourceUrl?: string;
  textIncluded: boolean;
  version?: string;
  topicCount: number;
  topics: StandardEntry[]; // upstream calls catalog entries "topics"; they are standards
}

export interface Manifest {
  dataset: string;
  taxonomyVersion: string;
  generatedAt: string;
  codesOnlySources: string[];
  counts: {
    topics: number;
    topicsBySubject: Record<string, number>;
    dependencies: number;
    curricula: number;
    curriculumStandards: number;
    topicStandardLinks: number;
    clusters: number;
  };
  files: Record<string, { bytes: number; sha256: string }>;
  excluded: string[];
}

export interface RawData {
  topics: Topic[];
  dependencies: DependencyEdge[];
  clusters: Cluster[];
  curricula: Curriculum[];
  manifest: Manifest;
}
```

- [ ] **Step 2: Write the failing test**

`test/load.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadData, TaxonomyDataError, DEFAULT_DATA_DIR } from '../src/taxonomy/load.js';

describe('loadData', () => {
  it('loads the real vendored data with verified counts', () => {
    const raw = loadData();
    expect(raw.topics.length).toBe(1590);
    expect(raw.dependencies.length).toBe(3221);
    expect(raw.clusters.length).toBe(183);
    expect(raw.curricula.length).toBe(7);
    expect(raw.manifest.taxonomyVersion).toBe('v1');
  });

  it('every dependency endpoint and standard key resolves', () => {
    const raw = loadData();
    const ids = new Set(raw.topics.map((t) => t.id));
    for (const d of raw.dependencies) {
      expect(ids.has(d.topicId)).toBe(true);
      expect(ids.has(d.prerequisiteId)).toBe(true);
    }
    const catalog = new Set(raw.curricula.flatMap((c) => c.topics.map((s) => s.key)));
    const links = raw.topics.flatMap((t) => t.standards);
    expect(links.length).toBe(1859);
    for (const k of links) expect(catalog.has(k)).toBe(true);
  });

  it('rejects tampered data (sha256/size mismatch)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tax-'));
    cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
    const p = path.join(dir, 'topics.json');
    // Appending one byte changes size + hash without any formatting assumptions.
    writeFileSync(p, readFileSync(p, 'utf8') + ' ');
    expect(() => loadData(dir)).toThrow(TaxonomyDataError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/load.test.ts`
Expected: FAIL - cannot resolve `../src/taxonomy/load.js`.

- [ ] **Step 4: Write src/taxonomy/load.ts**

```typescript
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

function check(cond: boolean, msg: string): void {
  if (!cond) throw new TaxonomyDataError(msg);
}

export function loadData(dataDir: string = DEFAULT_DATA_DIR): RawData {
  const manifest = readJson(dataDir, 'manifest.json') as Manifest;

  for (const [file, meta] of Object.entries(manifest.files)) {
    const buf = readFileSync(path.join(dataDir, file));
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/load.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 6: Delete placeholder (if created in Task 1), typecheck, commit**

```bash
rm -f src/placeholder.ts
npm run typecheck
git add -A
git commit -m "Add typed loader with manifest sha256 and referential integrity validation"
```

---

### Task 4: TaxonomyIndex (adjacency, topo order, standards join)

**Files:**
- Create: `src/taxonomy/index.ts`
- Test: `test/index.test.ts`, `test/fixtures/mini.ts`

**Interfaces:**
- Consumes: `loadData`, types from Task 3.
- Produces (`src/taxonomy/index.ts`):

```typescript
export interface CatalogEntry { curriculum: { slug: string; name: string; textIncluded: boolean }; entry: StandardEntry; }
export interface TaxonomyIndex {
  topics: Topic[];
  byId: Map<string, Topic>;
  prereqEdges: Map<string, DependencyEdge[]>;    // key = topicId; the topic's prerequisites
  dependentEdges: Map<string, DependencyEdge[]>; // key = prerequisiteId; topics that depend on key
  topoRank: Map<string, number>;                 // prerequisites rank lower than dependents
  standardsCatalog: Map<string, CatalogEntry>;   // key = "slug:code"
  standardToTopicIds: Map<string, string[]>;
  curricula: Curriculum[];
  clusters: Cluster[];
  subjects: string[];                            // sorted unique
  manifest: Manifest;
  stats: { hardEdges: number; softEdges: number; topicsWithStandards: number };
}
export function buildIndex(raw: RawData): TaxonomyIndex; // throws TaxonomyDataError on cycle
```

- [ ] **Step 1: Write the fixture** - `test/fixtures/mini.ts`

```typescript
import type { RawData, Topic, DependencyEdge, Manifest } from '../../src/taxonomy/types.js';

function t(id: string, name: string, subject: string, domain: string, start: number, end: number, centrality: number, extra: Partial<Topic> = {}): Topic {
  return {
    id, name, subject, domain, type: 'CONCEPTUAL',
    description: `${name} description`, ageRangeStart: start, ageRangeEnd: end, centrality,
    evidence: ['can do the thing'], assessmentPrompt: `Could {{name}} do ${name}?`, standards: [],
    ...extra,
  };
}

export const MINI_TOPICS: Topic[] = [
  t('A', 'Counting to 5', 'Mathematics', 'Number', 4, 5, 0.9, { standards: ['ccss-math:K.CC.A.1'] }),
  t('B', 'Number songs', 'Mathematics', 'Number', 4, 6, 0.3, { type: 'LANGUAGE' }),
  t('C', 'Addition to 10', 'Mathematics', 'Number', 5, 7, 0.6),
  t('D', 'Subtraction to 10', 'Mathematics', 'Number', 5, 7, 0.5, { evidence: [] }),
  t('E', 'Living things', 'Science', 'Biology', 5, 7, 0.4),
];

export const MINI_EDGES: DependencyEdge[] = [
  { topicId: 'C', prerequisiteId: 'A', strength: 'hard', reason: 'count before adding' },
  { topicId: 'C', prerequisiteId: 'B', strength: 'soft', reason: 'songs build fluency' },
  { topicId: 'D', prerequisiteId: 'C', strength: 'hard', reason: 'add before subtracting' },
];

export function miniRaw(overrides: Partial<RawData> = {}): RawData {
  return {
    topics: MINI_TOPICS,
    dependencies: MINI_EDGES,
    clusters: [{ subject: 'Mathematics', domain: 'Number', ageRangeStart: 4, summary: 'Early number sense.' }],
    curricula: [{
      slug: 'ccss-math', name: 'CCSS Math', textIncluded: true, topicCount: 1,
      topics: [{ key: 'ccss-math:K.CC.A.1', code: 'K.CC.A.1', data: { title: 'Count to 100', description: 'Count to 100 by ones and tens.' } }],
    }],
    manifest: { dataset: 'mini', taxonomyVersion: 'test', generatedAt: '2026-01-01T00:00:00Z', codesOnlySources: [], counts: { topics: 5, topicsBySubject: {}, dependencies: 3, curricula: 1, curriculumStandards: 1, topicStandardLinks: 1, clusters: 1 }, files: {}, excluded: [] } as Manifest,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests** - `test/index.test.ts`

```typescript
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run test/index.test.ts`
Expected: FAIL - cannot resolve `../src/taxonomy/index.js`.

- [ ] **Step 4: Write src/taxonomy/index.ts**

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/index.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add TaxonomyIndex with Kahn topo order and standards join"
```

---

### Task 5: Graph queries - prerequisites and unlocks

**Files:**
- Create: `src/taxonomy/graph.ts`
- Test: `test/graph.test.ts`

**Interfaces:**
- Consumes: `TaxonomyIndex` from Task 4.
- Produces (`src/taxonomy/graph.ts`):

```typescript
export interface TopicSummary { id: string; name: string; subject: string; domain: string; type: TopicType; ageRangeStart: number; ageRangeEnd: number; centrality: number; }
export function summarize(t: Topic): TopicSummary;
export interface RelatedTopic extends TopicSummary { strength: 'hard' | 'soft'; reason: string; depth: number; }
export type StrengthFilter = 'hard' | 'soft' | 'all';
export function prerequisitesOf(ix: TaxonomyIndex, id: string, opts?: { transitive?: boolean; strength?: StrengthFilter }): RelatedTopic[];
export function unlocksOf(ix: TaxonomyIndex, id: string, opts?: { transitive?: boolean }): RelatedTopic[];
```

Both throw `Error('unknown topic: <id>')` on unknown ids (tool layer pre-checks and formats the friendly error).
`depth` is 1 for direct edges. For transitive traversal, only edges passing the strength filter are followed.
Results are sorted by depth ascending, then centrality descending.
On transitive traversal a topic reachable at several depths keeps its minimum depth, and keeps the strength/reason of the first edge that reached it.

- [ ] **Step 1: Write the failing tests** - `test/graph.test.ts`

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/graph.test.ts`
Expected: FAIL - cannot resolve `../src/taxonomy/graph.js`.

- [ ] **Step 3: Write src/taxonomy/graph.ts**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/graph.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add prerequisite and unlocks graph walks with strength filtering"
```

---

### Task 6: Graph queries - frontier and path

**Files:**
- Modify: `src/taxonomy/graph.ts` (append)
- Test: `test/frontier.test.ts`

**Interfaces:**
- Produces (appended to `src/taxonomy/graph.ts`):

```typescript
export interface SoftGap { prerequisite: TopicSummary; reason: string; }
export interface FrontierEntry extends TopicSummary { softGaps: SoftGap[]; }
export function frontierFor(ix: TaxonomyIndex, masteredIds: string[], opts?: { subject?: string; ageMax?: number; limit?: number }): { frontier: FrontierEntry[]; totalCount: number; unknownMasteredIds: string[] };
export interface PathStep extends TopicSummary { requirement: 'required' | 'recommended' | 'goal'; unlocksInPath: { id: string; name: string; strength: 'hard' | 'soft'; reason: string }[]; }
export function pathTo(ix: TaxonomyIndex, goalId: string, masteredIds?: string[]): { steps: PathStep[]; goalAlreadyMastered: boolean };
```

Semantics (from the spec):
- Frontier: topics not mastered whose hard prerequisites are ALL mastered; unmet soft prerequisites become `softGaps`; `ageMax` filters on `ageRangeStart <= ageMax`; sorted by centrality descending; `limit` defaults to 100 (`totalCount` reports the pre-limit count). Unknown mastered ids are collected, not fatal.
- Path: ancestors are gathered by BFS from the goal, and traversal does NOT continue past a mastered topic (its subtree counts as satisfied). A topic reachable from the goal via hard edges only is `required`; reachable only via a path containing a soft edge is `recommended`. Steps are ordered by topoRank ascending (learn-first order) with the goal last. `unlocksInPath` lists edges from the step to other topics inside the path.

- [ ] **Step 1: Write the failing tests** - `test/frontier.test.ts`

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/frontier.test.ts`
Expected: FAIL - `frontierFor` not exported.

- [ ] **Step 3: Append to src/taxonomy/graph.ts**

```typescript
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
```

Also add `DependencyEdge` to the existing type-only import from `./types.js` at the top of the file if not already present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/frontier.test.ts test/graph.test.ts`
Expected: all PASS (earlier graph tests must still pass).

- [ ] **Step 5: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add frontier and study-path queries with mastered-stop semantics"
```

---

### Task 7: Search and did-you-mean

**Files:**
- Create: `src/taxonomy/search.ts`
- Test: `test/search.test.ts`

**Interfaces:**
- Consumes: `TaxonomyIndex`, `summarize`, `TopicSummary`.
- Produces (`src/taxonomy/search.ts`):

```typescript
export interface SearchHit extends TopicSummary { snippet: string; }
export interface SearchOpts { query?: string; subject?: string; domain?: string; ageMin?: number; ageMax?: number; type?: TopicType; limit?: number; }
export function searchTopics(ix: TaxonomyIndex, opts?: SearchOpts): SearchHit[];
export function suggestSimilar(ix: TaxonomyIndex, text: string, limit?: number): TopicSummary[];
```

Scoring: tokenize the query on non-alphanumerics, lowercase; per token, +3 if the name contains it, +2 if the domain contains it, +1 if the description contains it; keep hits with score > 0; sort by score, then centrality, both descending.
No query: filter only, sort by centrality descending. `limit` defaults to 20. Filters: `subject`/`domain`/`type` exact match; `ageMin` keeps topics with `ageRangeEnd >= ageMin`; `ageMax` keeps `ageRangeStart <= ageMax`. Snippet = first 140 chars of description.
`suggestSimilar` scores names only (same tokens, +3 per contained token, +5 exact name equality case-insensitive), returns top `limit` (default 3); used for did-you-mean.

- [ ] **Step 1: Write the failing tests** - `test/search.test.ts`

```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/search.test.ts`
Expected: FAIL - cannot resolve `../src/taxonomy/search.js`.

- [ ] **Step 3: Write src/taxonomy/search.ts**

```typescript
import type { TaxonomyIndex } from './index.js';
import { summarize, type TopicSummary } from './graph.js';
import type { TopicType } from './types.js';

export interface SearchHit extends TopicSummary { snippet: string; }
export interface SearchOpts {
  query?: string; subject?: string; domain?: string;
  ageMin?: number; ageMax?: number; type?: TopicType; limit?: number;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function searchTopics(ix: TaxonomyIndex, opts: SearchOpts = {}): SearchHit[] {
  const limit = opts.limit ?? 20;
  const pool = ix.topics.filter((t) =>
    (opts.subject === undefined || t.subject === opts.subject) &&
    (opts.domain === undefined || t.domain === opts.domain) &&
    (opts.type === undefined || t.type === opts.type) &&
    (opts.ageMin === undefined || t.ageRangeEnd >= opts.ageMin) &&
    (opts.ageMax === undefined || t.ageRangeStart <= opts.ageMax),
  );
  const hit = (t: (typeof pool)[number]): SearchHit => ({ ...summarize(t), snippet: t.description.slice(0, 140) });

  if (!opts.query) {
    return pool.sort((a, b) => b.centrality - a.centrality).slice(0, limit).map(hit);
  }
  const tokens = tokenize(opts.query);
  const scored = pool
    .map((t) => {
      const name = t.name.toLowerCase();
      const domain = t.domain.toLowerCase();
      const desc = t.description.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (name.includes(tok)) score += 3;
        if (domain.includes(tok)) score += 2;
        if (desc.includes(tok)) score += 1;
      }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.t.centrality - a.t.centrality);
  return scored.slice(0, limit).map((x) => hit(x.t));
}

export function suggestSimilar(ix: TaxonomyIndex, text: string, limit = 3): TopicSummary[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];
  return ix.topics
    .map((t) => {
      const name = t.name.toLowerCase();
      let score = name === text.toLowerCase() ? 5 : 0;
      for (const tok of tokens) if (name.includes(tok)) score += 3;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.t.centrality - a.t.centrality)
    .slice(0, limit)
    .map((x) => summarize(x.t));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/search.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add lexical search and did-you-mean suggester"
```

---

### Task 8: MCP tools and server factory

**Files:**
- Create: `src/tools.ts`, `src/buildServer.ts`
- Test: `test/tools.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4-7.
- Produces:
  - `src/tools.ts`: `registerTaxonomyTools(server: McpServer, ix: TaxonomyIndex): void`
  - `src/buildServer.ts`: `SERVER_VERSION: string`, `createTaxonomyServer(ix: TaxonomyIndex): McpServer`

The 9 tool names (exact): `search_topics`, `get_topic`, `prerequisites_of`, `unlocks`, `frontier_for`, `path_to`, `assess_topic`, `taxonomy_overview`, `standards_lookup`.

- [ ] **Step 1: Write the failing tests** - `test/tools.test.ts`

Uses the SDK's in-memory transport pair so no process or network is involved.

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildIndex } from '../src/taxonomy/index.js';
import { createTaxonomyServer } from '../src/buildServer.js';
import { miniRaw } from './fixtures/mini.js';

const ix = buildIndex(miniRaw());

async function connect() {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createTaxonomyServer(ix);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

function parse(result: Awaited<ReturnType<Client['callTool']>>): any {
  const c = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(c[0]!.text);
}

describe('taxonomy tools', () => {
  let client: Client;
  beforeAll(async () => { client = await connect(); });

  it('exposes exactly the 9 spec tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'assess_topic', 'frontier_for', 'get_topic', 'path_to', 'prerequisites_of',
      'search_topics', 'standards_lookup', 'taxonomy_overview', 'unlocks',
    ]);
  });

  it('search_topics returns ranked hits', async () => {
    const r = parse(await client.callTool({ name: 'search_topics', arguments: { query: 'addition' } }));
    expect(r.results[0].id).toBe('C');
  });

  it('get_topic returns the full record with counts', async () => {
    const r = parse(await client.callTool({ name: 'get_topic', arguments: { id: 'C' } }));
    expect(r.topic.assessmentPrompt).toContain('{{name}}');
    expect(r.prerequisiteCount).toBe(2);
    expect(r.unlockCount).toBe(1);
  });

  it('unknown id produces a did-you-mean error', async () => {
    const res = await client.callTool({ name: 'get_topic', arguments: { id: 'Counting' } });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('Unknown topic id');
    expect(text).toContain('Counting to 5');
  });

  it('frontier_for and path_to round-trip', async () => {
    const f = parse(await client.callTool({ name: 'frontier_for', arguments: { masteredIds: ['A'] } }));
    expect(f.frontier.map((x: any) => x.id)).toContain('C');
    const p = parse(await client.callTool({ name: 'path_to', arguments: { goalId: 'D', masteredIds: ['A'] } }));
    expect(p.steps.map((s: any) => s.id)).toEqual(['B', 'C', 'D']);
  });

  it('assess_topic fills the name and flags missing evidence', async () => {
    const r = parse(await client.callTool({ name: 'assess_topic', arguments: { id: 'A', childName: 'Ada' } }));
    expect(r.assessmentPrompt).toContain('Ada');
    expect(r.assessmentPrompt).not.toContain('{{name}}');
    const d = parse(await client.callTool({ name: 'assess_topic', arguments: { id: 'D' } }));
    expect(d.evidence).toEqual([]);
    expect(d.note).toMatch(/no evidence/i);
  });

  it('taxonomy_overview reports computed stats and attribution', async () => {
    const r = parse(await client.callTool({ name: 'taxonomy_overview', arguments: {} }));
    expect(r.totals.topics).toBe(5);
    expect(r.totals.dependencies).toEqual({ hard: 2, soft: 1 });
    expect(r.attribution).toContain('Marble');
  });

  it('standards_lookup works both directions and rejects bad input', async () => {
    const byTopic = parse(await client.callTool({ name: 'standards_lookup', arguments: { topicId: 'A' } }));
    expect(byTopic.alignments[0]).toMatchObject({ key: 'ccss-math:K.CC.A.1', title: 'Count to 100' });
    const byCode = parse(await client.callTool({ name: 'standards_lookup', arguments: { standardCode: 'ccss-math:K.CC.A.1' } }));
    expect(byCode.topics.map((t: any) => t.id)).toEqual(['A']);
    const bad = await client.callTool({ name: 'standards_lookup', arguments: {} });
    expect(bad.isError).toBe(true);
    const noStd = parse(await client.callTool({ name: 'standards_lookup', arguments: { topicId: 'B' } }));
    expect(noStd.note).toMatch(/no .*alignments/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/tools.test.ts`
Expected: FAIL - cannot resolve `../src/buildServer.js`.

- [ ] **Step 3: Write src/tools.ts**

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';
import {
  frontierFor, pathTo, prerequisitesOf, summarize, unlocksOf, type StrengthFilter, type TopicSummary,
} from './taxonomy/graph.js';
import { searchTopics, suggestSimilar } from './taxonomy/search.js';
import type { Topic } from './taxonomy/types.js';

const TOPIC_TYPES = ['CONCEPTUAL', 'LANGUAGE', 'META', 'PROCEDURAL', 'REPRESENTATIONAL'] as const;

class ToolInputError extends Error {}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { isError: true as const, content: [{ type: 'text' as const, text: message }] };
}

function fmt(s: TopicSummary): string {
  return `${s.name} (${s.id}, ${s.subject}, ages ${s.ageRangeStart}-${s.ageRangeEnd})`;
}

function requireTopic(ix: TaxonomyIndex, id: string): Topic {
  const t = ix.byId.get(id);
  if (t) return t;
  const near = suggestSimilar(ix, id, 3);
  const hint = near.length > 0 ? ` Did you mean: ${near.map(fmt).join('; ')}?` : '';
  throw new ToolInputError(`Unknown topic id "${id}".${hint} Use search_topics to find ids.`);
}

function requireSubject(ix: TaxonomyIndex, subject: string): void {
  if (!ix.subjects.includes(subject)) {
    throw new ToolInputError(`Unknown subject "${subject}". Subjects: ${ix.subjects.join(', ')}.`);
  }
}

/** Wrap a handler so ToolInputError becomes a friendly isError result. */
function guarded<A>(fn: (args: A) => ReturnType<typeof ok>) {
  return (args: A) => {
    try {
      return fn(args);
    } catch (e) {
      if (e instanceof ToolInputError) return err(e.message);
      throw e;
    }
  };
}

const ATTRIBUTION =
  'Data: Marble Skill Taxonomy (c) Marble (Generative Spark, Inc.), https://github.com/withmarbleapp/os-taxonomy. ' +
  'ODbL 1.0 (database) + CC BY-SA 4.0 (content).';

export function registerTaxonomyTools(server: McpServer, ix: TaxonomyIndex): void {
  server.registerTool('search_topics', {
    title: 'Search topics',
    description: 'Search the curriculum taxonomy by keywords and/or filters. Returns ranked topic summaries with ids for use in other tools. With no query, returns the highest-centrality topics matching the filters.',
    inputSchema: {
      query: z.string().optional(),
      subject: z.string().optional(),
      domain: z.string().optional(),
      ageMin: z.number().int().optional(),
      ageMax: z.number().int().optional(),
      type: z.enum(TOPIC_TYPES).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, guarded((args: { query?: string; subject?: string; domain?: string; ageMin?: number; ageMax?: number; type?: (typeof TOPIC_TYPES)[number]; limit?: number }) => {
    if (args.subject !== undefined) requireSubject(ix, args.subject);
    const results = searchTopics(ix, args);
    return ok({ resultCount: results.length, results });
  }));

  server.registerTool('get_topic', {
    title: 'Get topic',
    description: 'Full record for one topic: description, evidence criteria, assessment prompt, centrality, age range, standards keys, plus prerequisite/unlock counts.',
    inputSchema: { id: z.string() },
  }, guarded((args: { id: string }) => {
    const t = requireTopic(ix, args.id);
    const standardsNote = t.standards.length === 0
      ? `This topic has no curriculum standards alignments. That is normal: ${ix.stats.topicsWithStandards} of ${ix.topics.length} topics have them.`
      : undefined;
    return ok({
      topic: t,
      prerequisiteCount: ix.prereqEdges.get(t.id)!.length,
      unlockCount: ix.dependentEdges.get(t.id)!.length,
      ...(standardsNote ? { standardsNote } : {}),
    });
  }));

  server.registerTool('prerequisites_of', {
    title: 'Prerequisites of a topic',
    description: 'What must be learned before this topic. Each entry carries the human-written reason. transitive=true walks the whole ancestor chain (depth annotated). strength filters hard/soft edges.',
    inputSchema: {
      id: z.string(),
      transitive: z.boolean().optional(),
      strength: z.enum(['hard', 'soft', 'all']).optional(),
    },
  }, guarded((args: { id: string; transitive?: boolean; strength?: StrengthFilter }) => {
    const t = requireTopic(ix, args.id);
    const prerequisites = prerequisitesOf(ix, t.id, { transitive: args.transitive, strength: args.strength });
    return ok({ topic: summarize(t), prerequisiteCount: prerequisites.length, prerequisites });
  }));

  server.registerTool('unlocks', {
    title: 'What a topic unlocks',
    description: 'Topics that depend on this one (what it enables), with reasons. transitive=true walks all descendants.',
    inputSchema: { id: z.string(), transitive: z.boolean().optional() },
  }, guarded((args: { id: string; transitive?: boolean }) => {
    const t = requireTopic(ix, args.id);
    const unlocks = unlocksOf(ix, t.id, { transitive: args.transitive });
    return ok({ topic: summarize(t), unlockCount: unlocks.length, unlocks });
  }));

  server.registerTool('frontier_for', {
    title: 'Learning frontier',
    description: 'Given topics already mastered, returns what is learnable right now: every unmastered topic whose hard prerequisites are all mastered. Unmet soft prerequisites are listed as softGaps (readiness notes), not blockers. Sorted by centrality.',
    inputSchema: {
      masteredIds: z.array(z.string()).max(2000),
      subject: z.string().optional(),
      ageMax: z.number().int().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
  }, guarded((args: { masteredIds: string[]; subject?: string; ageMax?: number; limit?: number }) => {
    if (args.subject !== undefined) requireSubject(ix, args.subject);
    const r = frontierFor(ix, args.masteredIds, { subject: args.subject, ageMax: args.ageMax, limit: args.limit });
    return ok({
      frontierCount: r.totalCount,
      returned: r.frontier.length,
      ...(r.unknownMasteredIds.length > 0 ? { unknownMasteredIds: r.unknownMasteredIds } : {}),
      frontier: r.frontier,
    });
  }));

  server.registerTool('path_to', {
    title: 'Study path to a goal',
    description: 'Ordered study path from current mastery to a goal topic. Steps are topologically ordered (learn first things first); each is required (hard-edge chain) or recommended (soft support), with the reasons it unlocks later steps. Traversal treats mastered topics and everything beneath them as satisfied.',
    inputSchema: { goalId: z.string(), masteredIds: z.array(z.string()).max(2000).optional() },
  }, guarded((args: { goalId: string; masteredIds?: string[] }) => {
    const goal = requireTopic(ix, args.goalId);
    const r = pathTo(ix, goal.id, args.masteredIds ?? []);
    if (r.goalAlreadyMastered) {
      return ok({ goal: summarize(goal), goalAlreadyMastered: true, stepCount: 0, steps: [] });
    }
    return ok({ goal: summarize(goal), stepCount: r.steps.length, steps: r.steps });
  }));

  server.registerTool('assess_topic', {
    title: 'Assess mastery of a topic',
    description: 'Returns the parent-facing assessment prompt (with the child\'s name filled in) and the observable evidence criteria for mastery.',
    inputSchema: { id: z.string(), childName: z.string().optional() },
  }, guarded((args: { id: string; childName?: string }) => {
    const t = requireTopic(ix, args.id);
    const name = args.childName ?? 'your child';
    const note = t.evidence.length === 0
      ? 'This topic has no evidence checklist (35 topics do not). Use the assessment prompt as the conversational check.'
      : undefined;
    return ok({
      topic: summarize(t),
      assessmentPrompt: t.assessmentPrompt.replaceAll('{{name}}', name),
      evidence: t.evidence,
      ...(note ? { note } : {}),
    });
  }));

  server.registerTool('taxonomy_overview', {
    title: 'Taxonomy overview',
    description: 'Shape of the dataset: subjects with topic/domain counts, edge totals, age coverage, version, license and attribution.',
    inputSchema: {},
  }, guarded(() => {
    const subjects = ix.subjects.map((s) => {
      const ts = ix.topics.filter((t) => t.subject === s);
      return { subject: s, topicCount: ts.length, domainCount: new Set(ts.map((t) => t.domain)).size };
    });
    return ok({
      dataset: ix.manifest.dataset,
      taxonomyVersion: ix.manifest.taxonomyVersion,
      generatedAt: ix.manifest.generatedAt,
      subjects,
      totals: {
        topics: ix.topics.length,
        dependencies: { hard: ix.stats.hardEdges, soft: ix.stats.softEdges },
        curricula: ix.curricula.length,
        standardsInCatalog: ix.standardsCatalog.size,
        topicsWithStandards: ix.stats.topicsWithStandards,
        clusters: ix.clusters.length,
      },
      ageRange: {
        min: Math.min(...ix.topics.map((t) => t.ageRangeStart)),
        max: Math.max(...ix.topics.map((t) => t.ageRangeEnd)),
      },
      attribution: ATTRIBUTION,
    });
  }));

  server.registerTool('standards_lookup', {
    title: 'Curriculum standards lookup',
    description: 'Map between taxonomy topics and curriculum standards (CCSS Math/ELA, NGSS K-5 and MS, UK National Curriculum, IB PYP, C3). Provide exactly one of topicId or standardCode. standardCode accepts the full key ("ccss-math:K.CC.A.1") or a bare code plus the curriculum slug. Absence of alignments is normal, not an error.',
    inputSchema: {
      topicId: z.string().optional(),
      standardCode: z.string().optional(),
      curriculum: z.string().optional(),
    },
  }, guarded((args: { topicId?: string; standardCode?: string; curriculum?: string }) => {
    const modes = (args.topicId ? 1 : 0) + (args.standardCode ? 1 : 0);
    if (modes !== 1) throw new ToolInputError('Provide exactly one of topicId or standardCode.');

    if (args.topicId) {
      const t = requireTopic(ix, args.topicId);
      const alignments = t.standards.map((k) => {
        const cat = ix.standardsCatalog.get(k)!;
        return {
          key: k,
          code: cat.entry.code,
          curriculum: { slug: cat.curriculum.slug, name: cat.curriculum.name },
          ...(cat.entry.data.title ? { title: cat.entry.data.title } : {}),
          ...(cat.curriculum.textIncluded && cat.entry.data.description ? { description: cat.entry.data.description } : {}),
        };
      });
      const note = alignments.length === 0
        ? `No standards alignments for this topic. That is normal: ${ix.stats.topicsWithStandards} of ${ix.topics.length} topics have them.`
        : undefined;
      return ok({ topic: summarize(t), alignments, ...(note ? { note } : {}) });
    }

    const raw = args.standardCode!;
    const key = raw.includes(':') ? raw : args.curriculum ? `${args.curriculum}:${raw}` : null;
    if (!key) {
      throw new ToolInputError(`Bare standard codes need a curriculum slug. Slugs: ${ix.curricula.map((c) => c.slug).join(', ')}.`);
    }
    const cat = ix.standardsCatalog.get(key);
    if (!cat) {
      throw new ToolInputError(`Unknown standard "${key}". Curriculum slugs: ${ix.curricula.map((c) => c.slug).join(', ')}.`);
    }
    const topicIds = ix.standardToTopicIds.get(key) ?? [];
    const note = topicIds.length === 0
      ? 'No taxonomy topics map to this standard. That is normal: only some catalog standards are linked.'
      : undefined;
    return ok({
      standard: {
        key,
        code: cat.entry.code,
        curriculum: { slug: cat.curriculum.slug, name: cat.curriculum.name },
        ...(cat.entry.data.title ? { title: cat.entry.data.title } : {}),
        ...(cat.curriculum.textIncluded && cat.entry.data.description ? { description: cat.entry.data.description } : {}),
      },
      topics: topicIds.map((id) => summarize(ix.byId.get(id)!)),
      ...(note ? { note } : {}),
    });
  }));
}
```

- [ ] **Step 4: Write src/buildServer.ts**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';
import { registerTaxonomyTools } from './tools.js';
import { registerTaxonomyResources } from './resources.js';

export const SERVER_VERSION = '1.0.0';

export function createTaxonomyServer(ix: TaxonomyIndex): McpServer {
  const server = new McpServer(
    { name: 'taxonomy-mcp', version: SERVER_VERSION },
    {
      instructions:
        'Read-only knowledge-graph tools over the Marble Skill Taxonomy: ' +
        `${ix.topics.length} learning topics (ages 4-15) connected by ${ix.stats.hardEdges + ix.stats.softEdges} prerequisite edges. ` +
        'The server is stateless: tools like frontier_for and path_to take the learner\'s mastered topic ids as arguments. ' +
        'Start with search_topics or taxonomy_overview to find topic ids.',
    },
  );
  registerTaxonomyTools(server, ix);
  registerTaxonomyResources(server, ix);
  return server;
}
```

Note: `resources.ts` does not exist yet. Create a stub now so Task 8 compiles; Task 9 replaces it:

```typescript
// src/resources.ts (stub, replaced in the resources task)
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';
export function registerTaxonomyResources(_server: McpServer, _ix: TaxonomyIndex): void {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/tools.test.ts`
Expected: all PASS. If `registerTool`'s handler typing complains about the `guarded` wrapper, type handlers inline as `async` functions returning the `ok`/`err` result; keep behavior identical.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add the 9 MCP tools and server factory"
```

---

### Task 9: MCP resources

**Files:**
- Modify: `src/resources.ts` (replace the stub)
- Test: `test/resources.test.ts`

**Interfaces:**
- Produces: `registerTaxonomyResources(server: McpServer, ix: TaxonomyIndex): void` registering:
  - `taxonomy://about` (text/markdown)
  - `taxonomy://clusters/<encodeURIComponent(subject)>` for each subject present in `ix.clusters` (5 with real data, 1 with the fixture).

- [ ] **Step 1: Write the failing tests** - `test/resources.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildIndex } from '../src/taxonomy/index.js';
import { createTaxonomyServer } from '../src/buildServer.js';
import { miniRaw } from './fixtures/mini.js';

const ix = buildIndex(miniRaw());

describe('taxonomy resources', () => {
  let client: Client;
  beforeAll(async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createTaxonomyServer(ix);
    client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(st), client.connect(ct)]);
  });

  it('lists about + one cluster resource per subject with clusters', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['taxonomy://about', 'taxonomy://clusters/Mathematics']);
  });

  it('serves cluster summaries grouped by domain', async () => {
    const r = await client.readResource({ uri: 'taxonomy://clusters/Mathematics' });
    const text = (r.contents[0] as { text: string }).text;
    expect(text).toContain('## Number');
    expect(text).toContain('Early number sense.');
  });

  it('serves provenance in about', async () => {
    const r = await client.readResource({ uri: 'taxonomy://about' });
    const text = (r.contents[0] as { text: string }).text;
    expect(text).toContain('Marble');
    expect(text).toContain('ODbL');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/resources.test.ts`
Expected: FAIL - resource list is empty (stub).

- [ ] **Step 3: Replace src/resources.ts**

```typescript
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';

function renderClusters(subject: string, ix: TaxonomyIndex): string {
  const clusters = ix.clusters.filter((c) => c.subject === subject);
  const domains = [...new Set(clusters.map((c) => c.domain))].sort();
  const lines = [`# ${subject} - what children learn, by domain`, ''];
  for (const d of domains) {
    lines.push(`## ${d}`, '');
    for (const c of clusters.filter((x) => x.domain === d).sort((a, b) => a.ageRangeStart - b.ageRangeStart)) {
      lines.push(`**Ages ${c.ageRangeStart}+** - ${c.summary}`, '');
    }
  }
  return lines.join('\n');
}

function renderAbout(ix: TaxonomyIndex): string {
  const m = ix.manifest;
  return [
    '# About this server',
    '',
    `Dataset: ${m.dataset} (${m.taxonomyVersion}, generated ${m.generatedAt}).`,
    `Contents: ${ix.topics.length} topics, ${ix.stats.hardEdges + ix.stats.softEdges} prerequisite edges (${ix.stats.hardEdges} hard, ${ix.stats.softEdges} soft), ${ix.standardsCatalog.size} curriculum standards, ${ix.clusters.length} clusters.`,
    '',
    'Data (c) Marble (Generative Spark, Inc.) - https://github.com/withmarbleapp/os-taxonomy.',
    'Licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content); served here with attribution.',
    'This server is read-only and stateless; see the tool descriptions for usage.',
  ].join('\n');
}

export function registerTaxonomyResources(server: McpServer, ix: TaxonomyIndex): void {
  server.registerResource(
    'about',
    'taxonomy://about',
    { title: 'About taxonomy-mcp', description: 'Dataset provenance, version, license, attribution.', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: renderAbout(ix) }] }),
  );

  const subjects = [...new Set(ix.clusters.map((c) => c.subject))].sort();
  for (const subject of subjects) {
    server.registerResource(
      `clusters-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      `taxonomy://clusters/${encodeURIComponent(subject)}`,
      { title: `${subject} cluster summaries`, description: `Parent-friendly summaries of what children learn in ${subject}, by domain and age.`, mimeType: 'text/markdown' },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: renderClusters(subject, ix) }] }),
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/resources.test.ts test/tools.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Serve cluster summaries and provenance as MCP resources"
```

---

### Task 10: stdio entry and local Claude Code wiring

**Files:**
- Create: `src/stdio.ts`, `.mcp.json`
- Test: `test/stdio.test.ts`

**Interfaces:**
- Consumes: `loadData`, `buildIndex`, `createTaxonomyServer`.
- Produces: `npm run dev` serves MCP over stdio; `.mcp.json` lets Claude Code use it from this repo.

- [ ] **Step 1: Write the failing test** - `test/stdio.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('stdio entry (real data, real process)', () => {
  it('boots and answers tools/list and a real call', { timeout: 30000 }, async () => {
    const transport = new StdioClientTransport({
      command: 'node_modules/.bin/tsx',
      args: ['src/stdio.ts'],
    });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(transport);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    const res = await client.callTool({ name: 'taxonomy_overview', arguments: {} });
    const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
    expect(parsed.totals.topics).toBe(1590);
    await client.close();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/stdio.test.ts`
Expected: FAIL - `src/stdio.ts` does not exist (spawn error).

- [ ] **Step 3: Write src/stdio.ts**

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadData } from './taxonomy/load.js';
import { buildIndex } from './taxonomy/index.js';
import { createTaxonomyServer } from './buildServer.js';

// stdout belongs to the MCP protocol; every log line goes to stderr.
const ix = buildIndex(loadData());
const server = createTaxonomyServer(ix);
await server.connect(new StdioServerTransport());
console.error(`taxonomy-mcp (stdio) ready: ${ix.topics.length} topics, ${ix.stats.hardEdges + ix.stats.softEdges} edges`);
```

- [ ] **Step 4: Write .mcp.json**

```json
{
  "mcpServers": {
    "taxonomy": {
      "command": "npx",
      "args": ["tsx", "src/stdio.ts"]
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/stdio.test.ts`
Expected: PASS (boots the real data; allow the 30s timeout).

- [ ] **Step 6: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add stdio entry and repo-local Claude Code config"
```

This completes spec milestone M1.

---

### Task 11: Streamable HTTP entry

**Files:**
- Create: `src/http.ts`
- Test: `test/http.test.ts`

**Interfaces:**
- Produces (`src/http.ts`):

```typescript
export function createApp(ix: TaxonomyIndex): express.Express;
// Entry behavior when run directly: loads data, listens on PORT (default 3002).
```

Routes: `POST /mcp` (stateless MCP), `GET|DELETE /mcp` (405 JSON-RPC error), `GET /healthz`, `OPTIONS *` (CORS preflight).
Stateless pattern: a fresh `McpServer` + `StreamableHTTPServerTransport` per POST (`sessionIdGenerator: undefined`, `enableJsonResponse: true`); the shared `TaxonomyIndex` carries all the weight, so per-request registration is cheap.

- [ ] **Step 1: Write the failing tests** - `test/http.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/http.js';
import { buildIndex } from '../src/taxonomy/index.js';
import { miniRaw } from './fixtures/mini.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp(buildIndex(miniRaw()));
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('streamable HTTP server', () => {
  it('serves MCP over POST /mcp', async () => {
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    const res = await client.callTool({ name: 'get_topic', arguments: { id: 'A' } });
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text).topic.name).toBe('Counting to 5');
    await client.close();
  });

  it('rejects GET /mcp in stateless mode', async () => {
    const r = await fetch(`${base}/mcp`);
    expect(r.status).toBe(405);
  });

  it('reports health with counts', async () => {
    const r = await fetch(`${base}/healthz`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ status: 'ok', topics: 5, edges: 3 });
  });

  it('answers CORS preflight and exposes the session header', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-expose-headers')).toContain('Mcp-Session-Id');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/http.test.ts`
Expected: FAIL - cannot resolve `../src/http.js`.

- [ ] **Step 3: Write src/http.ts**

```typescript
import express from 'express';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadData } from './taxonomy/load.js';
import { buildIndex, type TaxonomyIndex } from './taxonomy/index.js';
import { createTaxonomyServer, SERVER_VERSION } from './buildServer.js';

export function createApp(ix: TaxonomyIndex): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Open-endpoint CORS: public data, no credentials.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      version: SERVER_VERSION,
      taxonomyVersion: ix.manifest.taxonomyVersion,
      topics: ix.topics.length,
      edges: ix.stats.hardEdges + ix.stats.softEdges,
    });
  });

  app.post('/mcp', async (req, res) => {
    try {
      // Stateless: fresh server + transport per request; the index is shared.
      const server = createTaxonomyServer(ix);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('mcp request failed:', e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: server is stateless, use POST' }, id: null });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}

// Run directly (node dist/http.js or tsx src/http.ts): boot with real data.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ix = buildIndex(loadData());
  const port = Number(process.env.PORT) || 3002;
  createApp(ix).listen(port, () => {
    console.error(`taxonomy-mcp (streamable-http) listening on :${port} - ${ix.topics.length} topics`);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/http.test.ts`
Expected: all PASS.

- [ ] **Step 5: Full suite + manual boot check**

Run: `npm test && (npm run dev:http & sleep 3 && curl -s localhost:3002/healthz && kill %1)`
Expected: all tests green; healthz JSON shows `"topics":1590`.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && git add -A && git commit -m "Add stateless streamable HTTP entry with healthz and CORS"
```

---

### Task 12: update-data script

**Files:**
- Create: `scripts/update-data.ts`

**Interfaces:**
- Consumes: `loadData` (reused as the validator).
- Produces: `npm run update-data` refreshes `data/` from upstream main, verifying sha256 + JSON Schemas, and rewrites `UPSTREAM.md`.

- [ ] **Step 1: Write scripts/update-data.ts**

```typescript
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv'; // ajv v8 default export; if tsx interop complains, use: import AjvMod from 'ajv'; const Ajv = AjvMod.default ?? AjvMod;
import { loadData } from '../src/taxonomy/load.js';

const REPO = 'withmarbleapp/os-taxonomy';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const DATA_FILES = ['topics.json', 'dependencies.json', 'clusters.json', 'curriculum-standards.json', 'manifest.json'];
const SCHEMA_FILES = ['topics.schema.json', 'dependencies.schema.json', 'clusters.schema.json', 'curriculum-standards.schema.json'];
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

const tmp = mkdtempSync(path.join(tmpdir(), 'tax-update-'));
console.error(`fetching upstream into ${tmp} ...`);
for (const f of DATA_FILES) writeFileSync(path.join(tmp, f), await fetchText(`${RAW}/data/${f}`));
const schemaTmp = path.join(tmp, 'schema');
cpSync(path.join(dataDir, 'schema'), schemaTmp, { recursive: true }); // fallback if a schema fetch fails
for (const f of SCHEMA_FILES) {
  try { writeFileSync(path.join(schemaTmp, f), await fetchText(`${RAW}/schema/${f}`)); }
  catch (e) { console.error(`schema ${f}: keeping vendored copy (${(e as Error).message})`); }
}

// JSON Schema validation (upstream's own schemas).
const ajv = new Ajv({ strict: false, allErrors: true });
for (const f of SCHEMA_FILES) {
  const schema = JSON.parse(readFileSync(path.join(schemaTmp, f), 'utf8'));
  const target = f.replace('.schema', '');
  const data = JSON.parse(readFileSync(path.join(tmp, target), 'utf8'));
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(validate.errors);
    throw new Error(`${target} fails ${f}`);
  }
  console.error(`schema ok: ${target}`);
}

// Full integrity validation: sha256, counts, references (same code path as boot).
loadData(tmp);
console.error('loadData validation ok');

// Record the upstream commit.
const head = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
  headers: { accept: 'application/vnd.github.v3+json' },
});
const commit = head.ok ? ((await head.json()) as { sha: string }).sha : 'unknown';

for (const f of DATA_FILES) cpSync(path.join(tmp, f), path.join(dataDir, f));
for (const f of readdirSync(schemaTmp)) cpSync(path.join(schemaTmp, f), path.join(dataDir, 'schema', f));
const manifest = JSON.parse(readFileSync(path.join(dataDir, 'manifest.json'), 'utf8')) as { taxonomyVersion: string };
writeFileSync(path.join(dataDir, 'UPSTREAM.md'), [
  '# Upstream provenance', '',
  'This directory vendors the Marble Skill Taxonomy.', '',
  `- Source: https://github.com/${REPO}`,
  `- Upstream commit: ${commit}`,
  `- Vendored on: ${new Date().toISOString().slice(0, 10)}`,
  `- Taxonomy version: ${manifest.taxonomyVersion}`, '',
  '## Attribution and license', '',
  'The taxonomy is (c) Marble (Generative Spark, Inc.), https://withmarble.com.',
  'Database structure licensed under ODbL 1.0; authored content under CC BY-SA 4.0.',
  'This project uses the data with attribution and does not modify it.',
  'Refresh only via `npm run update-data`.', '',
].join('\n'));
console.error('data/ updated. Review the diff and commit.');
```

- [ ] **Step 2: Verify with a live no-op run**

Run: `npm run update-data && git status --porcelain data/`
Expected: script prints `schema ok` x4, `loadData validation ok`, `data/ updated`.
`git status` shows at most `data/UPSTREAM.md` modified (the vendored-on date/commit line); the data files themselves are unchanged because upstream has not moved.
If data files DID change, upstream moved between Task 2 and now: inspect the diff, re-run the full test suite, and commit the refresh as its own commit.

- [ ] **Step 3: Restore UPSTREAM.md if only the date moved, then commit the script**

```bash
git checkout data/UPSTREAM.md 2>/dev/null || true
git add scripts/update-data.ts
git commit -m "Add update-data script with schema and integrity validation"
```

---

### Task 13: README, LICENSE, Dockerfile

**Files:**
- Create: `README.md`, `LICENSE`, `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Write README.md**

Content requirements (write real prose, one sentence per line):
- What it is: MCP server over Marble's os-taxonomy; link both repos; stateless, read-only, zero secrets.
- The 9 tools with one-line descriptions and the 2 resource families.
- Quickstart local: `npm install && npm run dev` (stdio) or via `.mcp.json` in Claude Code; `npm run dev:http` for HTTP on :3002.
- Client config: `claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp`.
- Data provenance + license section: ODbL 1.0 + CC BY-SA 4.0 attribution to Marble (Generative Spark, Inc.), pointer to `data/UPSTREAM.md`; code is MIT.
- `npm run update-data` refresh flow.
- Deploy summary pointing at `docs/deploy-runbook.md`.

- [ ] **Step 2: Write LICENSE**

MIT license text, `Copyright (c) 2026 Kyle Lynch`, plus a trailing note:

```
The curriculum data in data/ is not covered by this license.
It is (c) Marble (Generative Spark, Inc.) and licensed under ODbL 1.0 and CC BY-SA 4.0.
See data/UPSTREAM.md.
```

- [ ] **Step 3: Write Dockerfile and .dockerignore**

`Dockerfile`:

```dockerfile
# taxonomy-mcp - stateless streamable-HTTP MCP server (port 3002).

# ---- Stage 1: build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY data/ ./data/
EXPOSE 3002
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3002/healthz || exit 1
CMD ["node", "dist/http.js"]
```

`.dockerignore`:

```
node_modules
dist
.git
docs
test
scripts
.mcp.json
```

- [ ] **Step 4: Build and smoke-test the container** (requires Docker running)

```bash
docker build -t taxonomy-mcp .
docker run -d --rm -p 3005:3002 --name taxonomy-mcp-test taxonomy-mcp
sleep 2
curl -s localhost:3005/healthz
curl -s -X POST localhost:3005/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
docker rm -f taxonomy-mcp-test
```

Expected: healthz shows `"topics":1590`; the initialize POST returns a JSON-RPC result naming `taxonomy-mcp`.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE Dockerfile .dockerignore
git commit -m "Add README, MIT license with data attribution, and Docker image"
```

This completes spec milestone M2.

---

### Task 14: CI, deploy workflow, deploy runbook

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/deploy-runbook.md`

- [ ] **Step 1: Write .github/workflows/ci.yml**

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 2: Write .github/workflows/deploy.yml**

Mirrors keeper-mcp's proven pattern; public repo, so the droplet clone needs no token.

```yaml
name: Deploy to Droplet
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DROPLET_HOST }}
          username: ${{ secrets.DROPLET_USER }}
          key: ${{ secrets.DROPLET_SSH_KEY }}
          script: |
            if [ ! -d ~/taxonomy-mcp/.git ]; then
              git clone https://github.com/kylelynch/taxonomy-mcp.git ~/taxonomy-mcp
            fi
            cd ~/taxonomy-mcp
            git pull origin main
            docker build -t taxonomy-mcp .
            docker rm -f taxonomy-mcp 2>/dev/null || true
            docker run -d --restart always -p 3004:3002 --memory=192m --name taxonomy-mcp taxonomy-mcp
```

- [ ] **Step 3: Write docs/deploy-runbook.md**

Content (one sentence per line, no em dashes) - the manual steps only Kyle can do:

```markdown
# Deploy runbook - taxonomy-mcp

Everything below is a one-time manual step; after it, deploy is `git push origin main`.

## 1. GitHub repo

Create the public repo `kylelynch/taxonomy-mcp`, then:
`git remote add origin git@github.com:kylelynch/taxonomy-mcp.git && git push -u origin main`.

## 2. Actions secrets

Add the three droplet secrets used by every repo that deploys there (same values as keeper-mcp):
`DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`.

## 3. DNS

Add an A record: `taxonomy.kylelynch.us` -> droplet IP.

## 4. nginx (sudo, on the droplet)

Add the rate-limit zone once in the `http` block (for example in `/etc/nginx/conf.d/ratelimit.conf`):

    limit_req_zone $binary_remote_addr zone=taxonomy:10m rate=10r/s;

Add the server block (for example `/etc/nginx/sites-available/taxonomy.kylelynch.us`, then symlink into `sites-enabled`):

    server {
        server_name taxonomy.kylelynch.us;
        listen 80;

        location / {
            limit_req zone=taxonomy burst=20 nodelay;
            proxy_pass http://127.0.0.1:3004;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_buffering off;
            proxy_read_timeout 300s;
        }
    }

Then: `sudo nginx -t && sudo systemctl reload nginx`.

## 5. TLS

`sudo certbot --nginx -d taxonomy.kylelynch.us`.

## 6. First deploy and verify

Push to main (or run the Deploy workflow manually), then:
`curl -s https://taxonomy.kylelynch.us/healthz` shows `"topics":1590`.

## 7. Connect a client

`claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp`.
```

- [ ] **Step 4: Validate workflow YAML parses**

Run: `node -e 'const y = require("node:fs").readFileSync; JSON.stringify(y(".github/workflows/ci.yml","utf8")); console.error("files readable")'` then visually confirm both YAML files against the examples above (no YAML parser is installed; the CI run on first push is the real gate).

- [ ] **Step 5: Commit**

```bash
git add .github docs/deploy-runbook.md
git commit -m "Add CI, droplet deploy workflow, and deploy runbook"
```

This prepares spec milestone M3; the runbook's manual steps complete it.

---

## Final verification (after all tasks)

- [ ] `npm run typecheck` - clean.
- [ ] `npm test` - every suite green (load, index, graph, frontier, search, tools, resources, stdio, http).
- [ ] `npm run dev` boots and logs `taxonomy-mcp (stdio) ready: 1590 topics, 3221 edges` to stderr.
- [ ] Docker smoke test from Task 13 Step 4 passes.
- [ ] README attribution section present; `data/UPSTREAM.md` committed.
- [ ] `git log --oneline` shows one commit per task, no co-author lines.
