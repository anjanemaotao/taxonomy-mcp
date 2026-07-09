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
