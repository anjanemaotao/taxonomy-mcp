# taxonomy-mcp

An MCP (Model Context Protocol) server that exposes [Marble's open skill taxonomy](https://github.com/withmarbleapp/os-taxonomy) (`os-taxonomy`) as queryable tools for AI agents.
The taxonomy is a typed DAG of 1,590 micro-topics spanning ages 4-15, connected by 3,221 hard/soft prerequisite edges, each with a human-written reason, per-topic evidence criteria, a templated assessment prompt, and precomputed centrality.

This repository is [kylelynch/taxonomy-mcp](https://github.com/kylelynch/taxonomy-mcp).
The upstream dataset lives at [withmarbleapp/os-taxonomy](https://github.com/withmarbleapp/os-taxonomy).

The server is stateless, read-only, and requires zero secrets.
It holds no server-side accounts, mastery records, or database of any kind.
Tools that need to know what a learner already knows (`frontier_for`, `path_to`) take a list of mastered topic ids as an argument, so the calling agent owns all state.
The data is vendored into the repo and baked into the Docker image, so the server has no runtime network dependencies and every deploy is reproducible from the repo alone.

## Tools

All nine tools are read-only and validated with zod.

| Tool | What it does |
|---|---|
| `search_topics` | Search the taxonomy by keyword and filters (subject, domain, age range, type); returns ranked topic summaries with ids for use in other tools. |
| `get_topic` | Full record for one topic: description, evidence criteria, assessment prompt, centrality, age range, standards, and prerequisite/unlock counts. |
| `prerequisites_of` | What must be learned before a topic, each with a human-written reason; supports transitive closure and hard/soft strength filtering. |
| `unlocks` | What a topic enables, i.e. the topics that depend on it, each with a reason; supports transitive closure. |
| `frontier_for` | Given a list of mastered topic ids, returns what is learnable right now: every unmastered topic whose hard prerequisites are all satisfied. |
| `path_to` | An ordered study path from current mastery to a goal topic, topologically sorted, with each step marked required or recommended. |
| `assess_topic` | The parent-facing assessment prompt and observable evidence criteria for checking mastery of a topic. |
| `taxonomy_overview` | The shape of the dataset: subjects with topic/domain counts, edge totals, age coverage, taxonomy version, and license/attribution. |
| `standards_lookup` | Maps taxonomy topics to curriculum standards (CCSS Math/ELA, NGSS K-5 and MS, UK National Curriculum, IB PYP, C3) in either direction. |

## Resources

Two resource families are also exposed:

- `taxonomy://clusters/{subject}` - one resource per subject that has clusters, serving parent-friendly summaries of what children learn, grouped by domain and starting age.
- `taxonomy://about` - dataset provenance, taxonomy version, upstream commit, license, and attribution.

## Local quickstart

Install dependencies once:

```bash
npm install
```

Run the server locally over stdio (useful for local MCP clients and manual testing):

```bash
npm run dev
```

To wire it into Claude Code instead, this repo already ships a `.mcp.json` pointing at the stdio entry, so Claude Code will pick it up automatically when you open the project.

To run the streamable-HTTP transport locally on port 3002:

```bash
npm run dev:http
```

`GET /healthz` returns `{status, version, taxonomyVersion, topics, edges}`.
The MCP endpoint is `POST /mcp`.

## Client configuration

Once the server is deployed (see Deployment below), point any MCP-capable client at the hosted endpoint.
For Claude Code:

```bash
claude mcp add --transport http taxonomy https://taxonomy.kylelynch.us/mcp
```

## Data provenance and license

The code in this repository is licensed under MIT; see [LICENSE](./LICENSE).

The curriculum data in `data/` is not covered by that license.
It is vendored, unmodified, from Marble's `os-taxonomy` project and remains the property of Marble (Generative Spark, Inc.).
The database structure is licensed under the Open Database License (ODbL) 1.0, and the authored content within it is licensed under CC BY-SA 4.0.
Full provenance details, including the upstream commit and vendoring date, live in [data/UPSTREAM.md](./data/UPSTREAM.md).
Attribution to Marble also appears in the `taxonomy://about` MCP resource and in the `taxonomy_overview` tool output, so agents surfacing this data can pass attribution along.

## Refreshing the data

The vendored data is not fetched at runtime.
To pull a fresh copy from upstream, validate it, and rewrite `data/` and `data/UPSTREAM.md`:

```bash
npm run update-data
```

The script fetches the latest files from the upstream GitHub repository, verifies each file's sha256 and byte count against the fetched manifest, validates every file against the vendored JSON Schemas, and runs the same referential-integrity checks the server uses at boot.
Review the diff and commit the result; the server never talks to the network at boot or during a request.

## Deployment

The server is designed to run as a Docker container, built from the multi-stage `Dockerfile` in this repo, with the taxonomy data baked into the image.
It is deployed to Kyle's droplet behind nginx at `https://taxonomy.kylelynch.us/mcp`.
For the full build, deploy, and rollback procedure, see [docs/deploy-runbook.md](./docs/deploy-runbook.md).
