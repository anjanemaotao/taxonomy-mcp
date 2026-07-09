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
