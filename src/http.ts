import express from 'express';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadData } from './taxonomy/load.js';
import { buildIndex, type TaxonomyIndex } from './taxonomy/index.js';
import { createTaxonomyServer, SERVER_VERSION } from './buildServer.js';

export function createApp(ix: TaxonomyIndex): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Open-endpoint CORS: public data, no credentials.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({
      status: 'ok',
      version: SERVER_VERSION,
      taxonomyVersion: ix.manifest.taxonomyVersion,
      topics: ix.topics.length,
      edges: ix.stats.hardEdges + ix.stats.softEdges,
    });
  });

  app.post('/mcp', async (req, res) => {
    try {
      // Stateless: fresh server + transport per request; the index is shared.
      const server = createTaxonomyServer(ix);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error('mcp request failed:', e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });

  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: server is stateless, use POST' }, id: null });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}

// Run directly (node dist/http.js or tsx src/http.ts): boot with real data.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ix = buildIndex(loadData());
  const port = Number(process.env.PORT) || 3002;
  createApp(ix).listen(port, () => {
    console.error(`taxonomy-mcp (streamable-http) listening on :${port} - ${ix.topics.length} topics`);
  });
}
