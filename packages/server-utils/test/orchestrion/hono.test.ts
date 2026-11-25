import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { honoConfig } from '../../src/orchestrion/config/hono';

const CONTEXT_CODE = 'export class Context { constructor(req) { this.req = req; } }\n';
const HONO_BASE_CODE = 'export class Hono { request = (input) => input; }\n';

// The orchestrion matcher (`semifies`) and node-semver differ on prereleases: only `semifies` accepts
// `5.0.0-rc.1` in `>=4.0.0 <6`. This test fails if the matcher changes that.
describe('hono orchestrion config versionRange', () => {
  const transformer = createCodeTransformer({ instrumentations: honoConfig });
  let root: string;

  // The code transformer reads the version from the `package.json` on disk.
  const transformHono = (version: string, file: string, code: string): ReturnType<typeof transformer.transform> => {
    const dir = join(root, version, 'node_modules', 'hono');
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'hono', version, type: 'module' }));
    return transformer.transform(code, join(dir, file));
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orch-hono-'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it.each(['4.0.0', '4.13.13', '5.0.0-rc.0', '5.0.0-rc.1', '5.0.0'])('instruments hono %s', version => {
    expect(transformHono(version, 'dist/context.js', CONTEXT_CODE)?.code).toContain('orchestrion:hono:context');
    expect(transformHono(version, 'dist/hono-base.js', HONO_BASE_CODE)?.code).toContain('orchestrion:hono:request');
  });

  it.each(['3.12.12', '6.0.0-rc.0', '6.0.0'])('does not instrument hono %s', version => {
    expect(transformHono(version, 'dist/context.js', CONTEXT_CODE)).toBeNull();
    expect(transformHono(version, 'dist/hono-base.js', HONO_BASE_CODE)).toBeNull();
  });
});
