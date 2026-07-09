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
