import { describe, it, expect } from 'vitest';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadData, TaxonomyDataError, DEFAULT_DATA_DIR } from '../src/taxonomy/load.js';

describe('loadData', () => {
  it('loads the real vendored data with verified counts', () => {
    const raw = loadData();
    expect(raw.topics.length).toBe(1590);
    expect(raw.dependencies.length).toBe(3221);
    expect(raw.clusters.length).toBe(183);
    expect(raw.curricula.length).toBe(7);
    expect(raw.manifest.taxonomyVersion).toBe('v1');
  });

  it('every dependency endpoint and standard key resolves', () => {
    const raw = loadData();
    const ids = new Set(raw.topics.map((t) => t.id));
    for (const d of raw.dependencies) {
      expect(ids.has(d.topicId)).toBe(true);
      expect(ids.has(d.prerequisiteId)).toBe(true);
    }
    const catalog = new Set(raw.curricula.flatMap((c) => c.topics.map((s) => s.key)));
    const links = raw.topics.flatMap((t) => t.standards);
    expect(links.length).toBe(1859);
    for (const k of links) expect(catalog.has(k)).toBe(true);
  });

  it('rejects tampered data (sha256/size mismatch)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tax-'));
    cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
    const p = path.join(dir, 'topics.json');
    // Appending one byte changes size + hash without any formatting assumptions.
    writeFileSync(p, readFileSync(p, 'utf8') + ' ');
    expect(() => loadData(dir)).toThrow(TaxonomyDataError);
  });

  it('throws TaxonomyDataError when a manifest-listed file is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tax-'));
    cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
    rmSync(path.join(dir, 'clusters.json'));
    expect(() => loadData(dir)).toThrow(TaxonomyDataError);
  });

  it('rejects a topic with a null field even when sha256 matches', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tax-'));
    cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
    const topicsPath = path.join(dir, 'topics.json');
    const parsed = JSON.parse(readFileSync(topicsPath, 'utf8'));
    parsed.topics[0].domain = null;
    const updated = JSON.stringify(parsed);
    writeFileSync(topicsPath, updated);
    // Re-sign the tampered file so the sha256/byte gate passes and the field guard is what fires.
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files['topics.json'].sha256 = createHash('sha256').update(updated).digest('hex');
    manifest.files['topics.json'].bytes = Buffer.byteLength(updated);
    writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() => loadData(dir)).toThrow(TaxonomyDataError);
    expect(() => loadData(dir)).toThrow(/domain/i);
  });
});
