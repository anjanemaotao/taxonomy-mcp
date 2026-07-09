import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadData } from './taxonomy/load.js';
import { buildIndex } from './taxonomy/index.js';
import { createTaxonomyServer } from './buildServer.js';

// stdout belongs to the MCP protocol; every log line goes to stderr.
const ix = buildIndex(loadData());
const server = createTaxonomyServer(ix);
await server.connect(new StdioServerTransport());
console.error(`taxonomy-mcp (stdio) ready: ${ix.topics.length} topics, ${ix.stats.hardEdges + ix.stats.softEdges} edges`);
