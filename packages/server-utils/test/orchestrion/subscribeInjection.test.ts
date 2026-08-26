import { createCodeTransformer } from '@apm-js-collab/code-transformer-bundler-plugins/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHANNEL_INTEGRATION_DEFINITIONS,
  subscriberExportForModule,
} from '../../src/orchestrion/config/channel-integration-definitions';
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
    expect(subscriberExportForModule('mysql')).toBe('mysqlChannelIntegration');
    expect(subscriberExportForModule('pg')).toBe('postgresChannelIntegration');
    expect(subscriberExportForModule('pg-pool')).toBe('postgresChannelIntegration');
    expect(subscriberExportForModule('@redis/client')).toBe('redisChannelIntegration');
    expect(subscriberExportForModule('not-a-package')).toBeUndefined();
  });

  it('references only real named exports of @sentry/server-utils/orchestrion', async () => {
    const barrel = await import('../../src/orchestrion/index');
    for (const { exportName } of CHANNEL_INTEGRATION_DEFINITIONS) {
      expect(typeof (barrel as Record<string, unknown>)[exportName]).toBe('function');
    }
  });
});

describe('subscribe-injection transform option', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'orch-subscribe-'));
    makePackage(root, 'mysql', '2.18.1', 'commonjs');
    makePackage(root, 'pg', '8.11.0', 'module');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('adds Program injection configs and the custom transform only when opted in', () => {
    const off = orchestrionTransformOptions({});
    expect(off.customTransforms).toEqual({});
    expect(off.instrumentations.some(i => i.astQuery === 'Program' && i.transform)).toBe(false);

    const on = orchestrionTransformOptions({ injectChannelSubscribers: true });
    expect(Object.keys(on.customTransforms || {})).toContain('sentrySubscribeOrchestrionChannel');
    expect(on.instrumentations.some(i => i.astQuery === 'Program' && i.transform)).toBe(true);
  });

  it('injects a CJS marker-push importing only that package factory, after "use strict"', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({ injectChannelSubscribers: true }));
    const code =
      "'use strict';\nfunction Connection(){}\nConnection.prototype.query = function query(sql, cb){ return cb(); };\n";
    const result = t.transform(code, join(root, 'node_modules/mysql/lib/Connection.js'));

    expect(result).not.toBeNull();
    expect(result!.code.split('\n')[0]).toContain("'use strict'");
    // Imports ONLY the mysql factory plus the generic helper, from a single require.
    expect(result!.code).toMatch(
      /const\s*\{\s*mysqlChannelIntegration,\s*registerOrchestrionChannelIntegration\s*\}\s*=\s*require\(["']@sentry\/server-utils\/orchestrion["']\)/,
    );
    // The helper stores the factory on the marker AND live-registers it on an existing client, so a
    // module that loads AFTER `init()` (mysql loads its instrumented file lazily) still subscribes
    // for the in-flight request instead of only the next `init()`.
    expect(result!.code).toContain(
      'registerOrchestrionChannelIntegration("mysqlChannelIntegration", mysqlChannelIntegration)',
    );
    // The result is assigned to a global. `@sentry/server-utils` is `sideEffects: false` and the
    // helper returns `void`, so a bare call statement is one a bundler can prove droppable.
    // rollup >= 4.63.0 removes it, leaving the module instrumented but unsubscribed.
    expect(result!.code).toContain('globalThis.__SENTRY_ORCHESTRION_INJECT__ = registerOrchestrionChannelIntegration(');
    // No separate @sentry/core import at the injection site — the helper owns that.
    expect(result!.code).not.toContain('@sentry/core');
    // It imports ONLY the mysql factory — no central dispatch pulling in others.
    expect(result!.code).not.toContain('pgChannelIntegration');
    expect(result!.code).not.toContain('subscribeOrchestrionChannel');
    // The real channel-publishing transform still ran alongside the injection.
    expect(result!.code).toContain('orchestrion:mysql:query');
  });

  it('injects an ESM marker-push for an instrumented ESM module', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({ injectChannelSubscribers: true }));
    const result = t.transform(
      'export class Client { query(){} connect(){} }\n',
      join(root, 'node_modules/pg/lib/client.js'),
    );

    expect(result).not.toBeNull();
    expect(result!.code).toMatch(
      /import\s*\{\s*postgresChannelIntegration,\s*registerOrchestrionChannelIntegration\s*\}\s*from\s*["']@sentry\/server-utils\/orchestrion["']/,
    );
    expect(result!.code).not.toContain('@sentry/core');
    expect(result!.code).toContain(
      'registerOrchestrionChannelIntegration("postgresChannelIntegration", postgresChannelIntegration)',
    );
  });

  it('registers the factory at most once per file', () => {
    const t = createCodeTransformer(orchestrionTransformOptions({ injectChannelSubscribers: true }));
    // `pg`'s `lib/client.js` is matched by both the `query` and `connect` configs.
    const result = t.transform(
      'export class Client { query(){} connect(){} }\n',
      join(root, 'node_modules/pg/lib/client.js'),
    );

    const registrations =
      result!.code.match(/registerOrchestrionChannelIntegration\("postgresChannelIntegration"/g) ?? [];
    expect(registrations).toHaveLength(1);
  });
});
