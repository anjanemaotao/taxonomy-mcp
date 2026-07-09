import { mkdtempSync, readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020Mod from 'ajv/dist/2020.js'; // upstream schemas declare draft-2020-12; ajv v8 default class only bundles draft-07.
const Ajv2020 = (Ajv2020Mod as any).default ?? Ajv2020Mod;
import { loadData } from '../src/taxonomy/load.js';

const REPO = 'withmarbleapp/os-taxonomy';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const DATA_FILES = ['topics.json', 'dependencies.json', 'clusters.json', 'curriculum-standards.json', 'manifest.json'];
const SCHEMA_FILES = ['topics.schema.json', 'dependencies.schema.json', 'clusters.schema.json', 'curriculum-standards.schema.json'];
const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

const tmp = mkdtempSync(path.join(tmpdir(), 'tax-update-'));
console.error(`fetching upstream into ${tmp} ...`);
for (const f of DATA_FILES) writeFileSync(path.join(tmp, f), await fetchText(`${RAW}/data/${f}`));
const schemaTmp = path.join(tmp, 'schema');
cpSync(path.join(dataDir, 'schema'), schemaTmp, { recursive: true }); // fallback if a schema fetch fails
for (const f of SCHEMA_FILES) {
  try { writeFileSync(path.join(schemaTmp, f), await fetchText(`${RAW}/schema/${f}`)); }
  catch (e) { console.error(`schema ${f}: keeping vendored copy (${(e as Error).message})`); }
}

// JSON Schema validation (upstream's own schemas).
const ajv = new Ajv2020({ strict: false, allErrors: true });
for (const f of SCHEMA_FILES) {
  const schema = JSON.parse(readFileSync(path.join(schemaTmp, f), 'utf8'));
  const target = f.replace('.schema', '');
  const data = JSON.parse(readFileSync(path.join(tmp, target), 'utf8'));
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(validate.errors);
    throw new Error(`${target} fails ${f}`);
  }
  console.error(`schema ok: ${target}`);
}

// Full integrity validation: sha256, counts, references (same code path as boot).
loadData(tmp);
console.error('loadData validation ok');

// Record the upstream commit.
const head = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, {
  headers: { accept: 'application/vnd.github.v3+json' },
});
const commit = head.ok ? ((await head.json()) as { sha: string }).sha : 'unknown';

for (const f of DATA_FILES) cpSync(path.join(tmp, f), path.join(dataDir, f));
for (const f of readdirSync(schemaTmp)) cpSync(path.join(schemaTmp, f), path.join(dataDir, 'schema', f));
const manifest = JSON.parse(readFileSync(path.join(dataDir, 'manifest.json'), 'utf8')) as { taxonomyVersion: string };
writeFileSync(path.join(dataDir, 'UPSTREAM.md'), [
  '# Upstream provenance', '',
  'This directory vendors the Marble Skill Taxonomy.', '',
  `- Source: https://github.com/${REPO}`,
  `- Upstream commit: ${commit}`,
  `- Vendored on: ${new Date().toISOString().slice(0, 10)}`,
  `- Taxonomy version: ${manifest.taxonomyVersion}`, '',
  '## Attribution and license', '',
  'The taxonomy is (c) Marble (Generative Spark, Inc.), https://withmarble.com.',
  'Database structure licensed under ODbL 1.0; authored content under CC BY-SA 4.0.',
  'This project uses the data with attribution and does not modify it.',
  'Refresh only via `npm run update-data`.', '',
].join('\n'));
console.error('data/ updated. Review the diff and commit.');
