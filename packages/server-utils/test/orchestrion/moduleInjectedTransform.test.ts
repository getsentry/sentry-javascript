import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHANNEL_INTEGRATION_DEFINITIONS,
  subscriberExportForModule,
} from '../../src/orchestrion/config/channel-integration-definitions';
import { moduleInjectedTransforms } from '../../src/orchestrion/bundler/moduleInjectedTransform';
import { orchestrionTransformOptions } from '../../src/orchestrion/bundler/options';

// The code transformer reads the instrumented package's version from its
// on-disk `package.json`, so each test package needs a real directory.
function makePackage(root: string, name: string, version: string, type?: 'module' | 'commonjs'): void {
  const dir = join(root, 'node_modules', name);
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, ...(type ? { type } : {}) }));
}

describe('channel integration definitions', () => {
  it('maps every module to a defined subscriber export', () => {
    expect(subscriberExportForModule('mysql')).toBe('mysqlIntegration');
    expect(subscriberExportForModule('pg')).toBe('postgresIntegration');
    expect(subscriberExportForModule('pg-pool')).toBe('postgresIntegration');
    expect(subscriberExportForModule('@redis/client')).toBe('redisIntegration');
    expect(subscriberExportForModule('ioredis')).toBe('redisIntegration');
    expect(subscriberExportForModule('not-a-package')).toBeUndefined();
  });

  it('references only real named exports of @sentry/server-utils/orchestrion', async () => {
    const barrel = await import('../../src/orchestrion/index');
    for (const { exportName } of CHANNEL_INTEGRATION_DEFINITIONS) {
      expect(typeof (barrel as Record<string, unknown>)[exportName]).toBe('function');
    }
  });
});

describe('module-injected transform', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orch-module-injected-'));
    makePackage(root, 'mysql', '2.18.1', 'commonjs');
    makePackage(root, 'pg', '8.11.0', 'module');
    makePackage(root, 'my-lib', '1.0.0', 'commonjs');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('injects a CJS snippet importing only that package factory, after "use strict"', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({}));
    const code =
      "'use strict';\nfunction Connection(){}\nConnection.prototype.query = function query(sql, cb){ return cb(); };\n";
    const result = t.transform(code, join(root, 'node_modules/mysql/lib/Connection.js'));

    expect(result).not.toBeNull();
    expect(result!.code.split('\n')[0]).toContain("'use strict'");
    // Imports ONLY the mysql factory plus the generic helper, from a single require.
    expect(result!.code).toMatch(
      /const\s*\{\s*orchestrionModuleInjected,\s*mysqlIntegration\s*\}\s*=\s*require\(["']@sentry\/server-utils\/orchestrion["']\)/,
    );
    // The helper is called with the REAL module name, so no reverse lookup is
    // needed at runtime and the lazy-subscription event matches what channel
    // integrations wait for.
    expect(result!.code).toContain('orchestrionModuleInjected("mysql", mysqlIntegration)');
    // No separate @sentry/core import at the injection site — the helper owns that.
    expect(result!.code).not.toContain('@sentry/core');
    // It imports ONLY the mysql factory — no central dispatch pulling in others.
    expect(result!.code).not.toContain('postgresIntegration');
    // The real channel-publishing transform still ran alongside the injection.
    expect(result!.code).toContain('orchestrion:mysql:query');
  });

  it('injects an ESM snippet for an instrumented ESM module', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({}));
    const result = t.transform(
      'export class Client { query(){} connect(){} }\n',
      join(root, 'node_modules/pg/lib/client.js'),
    );

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(
      /import\s*\{\s*orchestrionModuleInjected,\s*postgresIntegration\s*\}\s*from\s*["']@sentry\/server-utils\/orchestrion["']/,
    );
    expect(result!.code).not.toContain('@sentry/core');
    expect(result!.code).toContain('orchestrionModuleInjected("pg", postgresIntegration)');
  });

  it('injects a helper-only snippet for a module with no subscriber factory', () => {
    // A custom instrumentation for a package outside CHANNEL_INTEGRATION_DEFINITIONS —
    // the marker/event coverage the banner used to provide now comes from this snippet.
    const t = createCodeTransformer(
      orchestrionTransformOptions({
        instrumentations: [
          {
            channelName: 'work',
            module: { name: 'my-lib', versionRange: '>=1', filePath: 'lib/index.js' },
            functionQuery: { functionName: 'doWork', kind: 'Sync' },
          },
        ],
      }),
    );
    const result = t.transform('function doWork(){ return 1; }\n', join(root, 'node_modules/my-lib/lib/index.js'));

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(
      /const\s*\{\s*orchestrionModuleInjected\s*\}\s*=\s*require\(["']@sentry\/server-utils\/orchestrion["']\)/,
    );
    expect(result!.code).toContain('orchestrionModuleInjected("my-lib")');
  });

  it('injects at most once per file', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({}));
    // `pg`'s `lib/client.js` is matched by both the `query` and `connect` configs.
    const result = t.transform(
      'export class Client { query(){} connect(){} }\n',
      join(root, 'node_modules/pg/lib/client.js'),
    );

    const calls = result!.code.match(/orchestrionModuleInjected\("pg"/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('honors a custom import specifier (Turbopack passes an absolute path)', () => {
    const t = createCodeTransformer({
      ...orchestrionTransformOptions({}),
      customTransforms: moduleInjectedTransforms('/abs/path/to/orchestrion/index.js'),
    });
    const result = t.transform(
      "'use strict';\nfunction Connection(){}\nConnection.prototype.query = function query(sql, cb){ return cb(); };\n",
      join(root, 'node_modules/mysql/lib/Connection.js'),
    );

    expect(result).not.toBeNull();
    expect(result!.code).toContain('require("/abs/path/to/orchestrion/index.js")');
    expect(result!.code).not.toContain('require("@sentry/server-utils/orchestrion")');
  });
});
