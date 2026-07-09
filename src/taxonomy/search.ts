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
