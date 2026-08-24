import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { orchestrionTransformOptions } from '../../src/orchestrion/bundler/options';

// The transformer resolves the instrumented package's version from its on-disk `package.json`,
// so each version under test needs its own package root.
const roots: string[] = [];

// Mirrors the shape of openai's generated resource files: a `class X extends APIResource` whose
// `create(body, options)` returns the client's thenable `APIPromise`. This shape is byte-identical
// across openai 4-7 — v7's only breaking change was requiring Node.js 22 — so a single fixture
// legitimately stands in for every major in the declared range.
function resourceSource(className: string): string {
  return `'use strict';\nclass ${className} extends APIResource {\n  create(body, options) {\n    return this._client.post('/x', { body, ...options });\n  }\n}\nexports.${className} = ${className};\n`;
}

const MATCH_POINTS = [
  {
    filePath: 'resources/chat/completions/completions.js',
    className: 'Completions',
    channel: 'orchestrion:openai:chat',
  },
  { filePath: 'resources/responses/responses.js', className: 'Responses', channel: 'orchestrion:openai:chat' },
  { filePath: 'resources/embeddings.js', className: 'Embeddings', channel: 'orchestrion:openai:embeddings' },
  {
    filePath: 'resources/conversations/conversations.js',
    className: 'Conversations',
    channel: 'orchestrion:openai:chat',
  },
] as const;

function makeOpenAiPackage(version: string): string {
  const root = mkdtempSync(join(tmpdir(), 'orch-openai-'));
  roots.push(root);
  const dir = join(root, 'node_modules', 'openai');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'openai', version, type: 'commonjs' }));
  for (const { filePath, className } of MATCH_POINTS) {
    const file = join(dir, filePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, resourceSource(className));
  }
  return dir;
}

function transformMatchPoints(version: string): (string | null)[] {
  const dir = makeOpenAiPackage(version);
  const transformer = createCodeTransformer(orchestrionTransformOptions({}));
  return MATCH_POINTS.map(({ filePath, className }) => {
    const result = transformer.transform(resourceSource(className), join(dir, filePath));
    return result?.code ?? null;
  });
}

describe('orchestrion config — openai declared version range', () => {
  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Guards against the declared range falling behind upstream: openai 7 shipped while the range
  // still said `<7`, which silently dropped instrumentation for everyone on the current major.
  it.each(['4.0.0', '5.18.1', '6.49.0', '7.0.0', '7.5.0'])('instruments every match point on openai %s', version => {
    const codes = transformMatchPoints(version);

    codes.forEach((code, i) => {
      expect(code, `${MATCH_POINTS[i]!.filePath} was not transformed`).not.toBeNull();
      expect(code).toContain(MATCH_POINTS[i]!.channel);
    });
  });

  // The upper bound is deliberate, not incidental: a new major must be checked against the real
  // package before it is declared, so it has to stay excluded until someone does that.
  it.each(['3.9.0', '8.0.0'])('leaves openai %s untouched, outside the declared range', version => {
    expect(transformMatchPoints(version)).toEqual([null, null, null, null]);
  });
});
