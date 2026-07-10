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

  it('lists about + graph + one cluster resource per subject with clusters', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['taxonomy://about', 'taxonomy://clusters/Mathematics', 'taxonomy://graph']);
  });

  it('serves the full graph as lean JSON', async () => {
    const r = await client.readResource({ uri: 'taxonomy://graph' });
    const c = r.contents[0] as { mimeType?: string; text: string };
    expect(c.mimeType).toBe('application/json');
    const g = JSON.parse(c.text) as {
      taxonomyVersion: string;
      attribution: string;
      topics: Record<string, unknown>[];
      edges: Record<string, unknown>[];
    };
    expect(g.taxonomyVersion).toBe(ix.manifest.taxonomyVersion);
    expect(g.attribution).toContain('Marble');
    expect(g.topics).toHaveLength(ix.manifest.counts.topics);
    expect(g.edges).toHaveLength(ix.manifest.counts.dependencies);

    expect(g.topics.find((t) => t.id === 'A')).toEqual({
      id: 'A', name: 'Counting to 5', subject: 'Mathematics', domain: 'Number',
      type: 'CONCEPTUAL', ageRangeStart: 4, ageRangeEnd: 5, centrality: 0.9,
    });
    expect(g.edges).toContainEqual({ topicId: 'C', prerequisiteId: 'A', strength: 'hard' });

    const ids = new Set(g.topics.map((t) => t.id));
    for (const e of g.edges) {
      expect(ids.has(e.topicId as string)).toBe(true);
      expect(ids.has(e.prerequisiteId as string)).toBe(true);
      expect(e).not.toHaveProperty('reason');
    }
    for (const t of g.topics) {
      expect(t).not.toHaveProperty('description');
      expect(t).not.toHaveProperty('evidence');
      expect(t).not.toHaveProperty('assessmentPrompt');
    }
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
