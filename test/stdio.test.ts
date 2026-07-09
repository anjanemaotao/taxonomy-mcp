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
