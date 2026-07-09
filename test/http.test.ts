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
