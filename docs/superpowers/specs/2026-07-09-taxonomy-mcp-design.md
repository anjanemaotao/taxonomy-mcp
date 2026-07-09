# taxonomy-mcp - Design

**Date:** 2026-07-09
**Status:** Approved by Kyle (brainstorming session, both parts)

## What this is

An MCP server that exposes Marble's open curriculum taxonomy (https://github.com/withmarbleapp/os-taxonomy) as queryable tools for AI agents.
The taxonomy is a typed DAG of 1,590 elementary-education micro-topics connected by 3,221 hard/soft prerequisite edges, with per-topic evidence criteria, templated assessment prompts, precomputed centrality, and human-written reasons on every edge.
The server runs locally over stdio for development and is deployed to Kyle's droplet over streamable HTTP at `https://taxonomy.kylelynch.us/mcp`.

## Locked decisions

1. **Stateless oracle.** No server-side mastery state, no accounts, no database. Tools that need learner state (frontier, path) take a list of mastered topic IDs as an argument; the calling agent owns state.
2. **Full tool kit + MCP resources.** Nine read-only tools plus cluster-summary and provenance resources.
3. **Open endpoint.** No auth. The data is openly licensed, the server is read-only with no secrets. nginx rate limiting is the only abuse guard. The Express middleware seam makes a bearer token a small later addition if ever needed.
4. **Public repo `kylelynch/taxonomy-mcp`**, local dir `/Library/Code/taxonomy-mcp`.
5. **Stack: TypeScript + official `@modelcontextprotocol/sdk`**, mirroring keeper-mcp (Express for streamable HTTP, zod schemas, tsc build, Docker, GitHub Actions SSH deploy).
6. **Lexical search, no embeddings.** Embeddings would require an API key and break the zero-secrets property. 1,590 short records score fine lexically. The tool signature would not change if local embeddings were added later.
7. **Hostname:** `taxonomy.kylelynch.us`, proxied by the droplet's nginx to host port 3004.

## Repo layout

```
taxonomy-mcp/
├── data/                  # vendored upstream JSON + UPSTREAM.md (version, commit, attribution)
├── src/
│   ├── taxonomy/
│   │   ├── load.ts        # parse + validate JSON, fail fast on bad data or cycles
│   │   ├── index.ts       # TaxonomyIndex: id map, hard/soft adjacency both directions, topo order, search index
│   │   └── graph.ts       # pure functions: prerequisites, unlocks, frontier, path; no MCP imports
│   ├── tools.ts           # zod schemas + tool handlers (thin wrappers over graph.ts)
│   ├── resources.ts       # cluster summaries + about/provenance
│   ├── buildServer.ts     # assembles McpServer (shared by both transports)
│   ├── stdio.ts           # local dev entry (wired into .mcp.json for Claude Code testing)
│   └── http.ts            # Express + StreamableHTTPServerTransport (stateless) + /healthz
├── scripts/update-data.ts # fetch fresh JSON from upstream GitHub, validate, rewrite data/ + UPSTREAM.md
├── test/
├── Dockerfile
└── .github/workflows/     # ci.yml (typecheck + tests), deploy.yml (SSH deploy after tests)
```

## Data layer

The four upstream JSON files (`topics.json`, `dependencies.json`, `clusters.json`, `curriculum-standards.json`) are vendored into `data/` and committed.
The server has zero runtime network dependencies and every deploy is reproducible from the repo alone.
Refreshing from upstream is an explicit `npm run update-data` followed by a commit; the script fetches from GitHub raw, validates shape and counts, and rewrites `data/` plus `UPSTREAM.md`.

At boot, `load.ts` validates the files (shape, counts against the manifest, referential integrity of edge endpoints) and `index.ts` builds:

- `Map<id, Topic>`
- forward and reverse adjacency lists split by hard/soft strength
- one Kahn topological sort of the full DAG (also serves as the cycle check)
- a lowercase token index over name/description/domain for search

Boot crashes loudly on any validation failure or cycle.
Bad data must never serve.

ODbL/CC BY-SA attribution to Marble (Generative Spark, Inc.) lives in `data/UPSTREAM.md`, the README, and the `taxonomy://about` resource.

## Tools

All tools are read-only and zod-validated.

| Tool | Input | Output |
|---|---|---|
| `search_topics` | `query?`, `subject?`, `domain?`, `ageMin?`, `ageMax?`, `type?`, `limit?` (default 20, max 100) | ranked topic summaries (id, name, subject, domain, ages, type, centrality, snippet) |
| `get_topic` | `id` | full record (description, evidence, assessment prompt, centrality, ages, standards) + direct prereq/unlock counts |
| `prerequisites_of` | `id`, `transitive?` (default false), `strength?` (`hard`/`soft`/`all`, default `all`) | prerequisite edges with the human-written `reason` strings; transitive results are topologically ordered with depth |
| `unlocks` | `id`, `transitive?` | dependent topics with reasons (what this topic enables) |
| `frontier_for` | `masteredIds[]` (max 2,000), `subject?`, `ageMax?` | topics whose hard prerequisites are all mastered and which are not themselves mastered; unmet soft prerequisites surfaced as readiness notes |
| `path_to` | `goalId`, `masteredIds[]?` (default empty) | topologically ordered study path through unmastered prerequisites to the goal, hard/soft annotated with reasons |
| `assess_topic` | `id`, `childName?` | assessment prompt with `{{name}}` filled (generic phrasing when omitted) + evidence criteria + age range |
| `taxonomy_overview` | (none) | subjects, domains per subject, topic/edge counts, age coverage, taxonomy version + attribution |
| `standards_lookup` | `topicId?` XOR `standardCode?`, `curriculum?` | standards alignments in both directions (NGSS, Common Core, UK National Curriculum) |

## Resources

- `taxonomy://clusters/{subject}` - one resource per subject serving the parent-friendly cluster summaries from `clusters.json`.
- `taxonomy://about` - provenance, taxonomy version, upstream commit, license, and attribution.

## Transports

`buildServer.ts` assembles the `McpServer` once; two thin entries share it.

- **stdio** (`src/stdio.ts`): local development. A `.mcp.json` entry in the repo makes the server testable inside Claude Code before any HTTP exists.
- **streamable HTTP** (`src/http.ts`): Express hosting `StreamableHTTPServerTransport` in stateless mode (no session tracking - fits a read-only oracle, survives container restarts, lets nginx treat it as a plain upstream). MCP endpoint at `/mcp`. `/healthz` returns version and topic/edge counts. Permissive CORS so browser-based MCP clients work against the open endpoint.

## Error handling

- zod rejects malformed inputs at the tool boundary with readable messages.
- Unknown topic IDs return a tool error with nearest-name suggestions ("did you mean ...") because agents sometimes hallucinate IDs.
- Input guards cap list sizes (`masteredIds` <= 2,000, `limit` <= 100) so no request causes unbounded work.
- Boot-time validation failure crashes the process with a clear message.
- Any uncaught error logs and exits nonzero; Docker `--restart unless-stopped` restarts it. A restart is always safe because boot revalidates the data.

## Testing

Vitest, two tiers; CI runs typecheck plus both tiers on every push, and deploy only triggers when tests pass.

1. **Unit tests on `graph.ts`** against a small synthetic DAG fixture: frontier correctness (hard vs soft), path ordering, transitive closure, cycle detection, the did-you-mean suggester.
2. **Real-data smoke + integration:** load the vendored data and assert counts match the upstream manifest and a known edge exists; boot the HTTP server on an ephemeral port and drive every tool once through the SDK client over streamable HTTP.

## Docker + deploy

- Multi-stage `node:24-alpine` Dockerfile; data baked into the image (the image is the deployment, no volumes); non-root user; container healthcheck on `/healthz`.
- `deploy.yml` mirrors keeper-mcp: push to main, tests pass, SSH to droplet, clone-if-missing/pull, docker build, restart container on host port 3004 (keeper-mcp holds 3003).
- nginx: one new server block for `taxonomy.kylelynch.us` proxying to `127.0.0.1:3004`, with a `limit_req` zone (~10 req/s per IP, small burst).
- Manual Kyle steps (matching the no-sudo-for-agents stance): DNS A record, sudo nginx edit, certbot run.
- Client config: `claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp`.

## Milestones

- **M1:** stdio server working in Claude Code locally (all 9 tools + resources).
- **M2:** HTTP + Docker working locally (integration tests green against the container).
- **M3:** live on the droplet at `https://taxonomy.kylelynch.us/mcp`.

## Out of scope (v1)

- Server-side mastery state, profiles, or persistence of any kind.
- Auth (seam noted for a static bearer token later).
- Embedding-based search.
- Any UI. This is a tools-only surface for agents.
