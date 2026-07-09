import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TaxonomyIndex } from './taxonomy/index.js';
import { registerTaxonomyTools } from './tools.js';
import { registerTaxonomyResources } from './resources.js';

export const SERVER_VERSION = '1.0.0';

export function createTaxonomyServer(ix: TaxonomyIndex): McpServer {
  const server = new McpServer(
    { name: 'taxonomy-mcp', version: SERVER_VERSION },
    {
      instructions:
        'Read-only knowledge-graph tools over the Marble Skill Taxonomy: ' +
        `${ix.topics.length} learning topics (ages 4-15) connected by ${ix.stats.hardEdges + ix.stats.softEdges} prerequisite edges. ` +
        'The server is stateless: tools like frontier_for and path_to take the learner\'s mastered topic ids as arguments. ' +
        'Start with search_topics or taxonomy_overview to find topic ids.',
    },
  );
  registerTaxonomyTools(server, ix);
  registerTaxonomyResources(server, ix);
  return server;
}
