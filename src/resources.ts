import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';
import { ATTRIBUTION } from './attribution.js';

/**
 * The whole graph in one lean JSON payload, for map/visualization clients.
 * Edges omit reasons and topics omit descriptions on purpose; the tools
 * (get_topic, prerequisites_of, unlocks) remain the source for rich detail.
 */
function renderGraph(ix: TaxonomyIndex): string {
  const topics = ix.topics.map(({ id, name, subject, domain, type, ageRangeStart, ageRangeEnd, centrality }) => (
    { id, name, subject, domain, type, ageRangeStart, ageRangeEnd, centrality }
  ));
  const edges = [...ix.prereqEdges.values()].flat().map(({ topicId, prerequisiteId, strength }) => (
    { topicId, prerequisiteId, strength }
  ));
  return JSON.stringify({ taxonomyVersion: ix.manifest.taxonomyVersion, attribution: ATTRIBUTION, topics, edges });
}

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

  const graphJson = renderGraph(ix);
  server.registerResource(
    'graph',
    'taxonomy://graph',
    { title: 'Full taxonomy graph', description: 'Every topic summary and prerequisite edge in one JSON payload, for building maps and visualizations. Lean by design: reasons and descriptions live behind the tools.', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: graphJson }] }),
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
