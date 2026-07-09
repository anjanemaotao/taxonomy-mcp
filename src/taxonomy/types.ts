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
