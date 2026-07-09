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
