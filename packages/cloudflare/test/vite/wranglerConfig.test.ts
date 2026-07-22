import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWranglerConfig } from '../../src/vite/wranglerConfig';

function writeTempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

describe('resolveWranglerConfig', () => {
  it('parses wrangler.toml', () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "src/index.ts"',
        '',
        '[[durable_objects.bindings]]',
        'name = "MY_DO"',
        'class_name = "MyDurableObject"',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result).toBeDefined();
    // wrangler resolves `main` to an absolute path against the config dir.
    expect(result!.config.main).toBe(join(dir, 'src/index.ts'));
    expect(result!.config.durableObjects).toEqual([{ name: 'MY_DO', className: 'MyDurableObject' }]);
  });

  it('parses wrangler.json', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/worker.ts',
        durable_objects: {
          bindings: [{ name: 'DO_A', class_name: 'A' }],
        },
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result).toBeDefined();
    expect(result!.config.main).toBe(join(dir, 'src/worker.ts'));
    expect(result!.config.durableObjects).toEqual([{ name: 'DO_A', className: 'A' }]);
  });

  it('parses wrangler.jsonc (strips comments)', () => {
    const dir = writeTempDir({
      'wrangler.jsonc': [
        '{',
        '  // Entry point',
        '  "main": "src/index.ts",',
        '  /* DO bindings */',
        '  "durable_objects": {',
        '    "bindings": [',
        '      { "name": "DO", "class_name": "MyDO" }',
        '    ]',
        '  }',
        '}',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result).toBeDefined();
    expect(result!.config.main).toBe(join(dir, 'src/index.ts'));
    expect(result!.config.durableObjects).toEqual([{ name: 'DO', className: 'MyDO' }]);
  });

  it('parses JSONC with trailing commas', () => {
    const dir = writeTempDir({
      'wrangler.jsonc': [
        '{',
        '  "main": "src/index.ts",',
        '  "durable_objects": {',
        '    "bindings": [',
        '      { "name": "DO", "class_name": "MyDO" },',
        '    ],',
        '  },',
        '}',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe(join(dir, 'src/index.ts'));
    expect(result!.config.durableObjects).toEqual([{ name: 'DO', className: 'MyDO' }]);
  });

  it('parses TOML single-quoted (literal) strings', () => {
    const dir = writeTempDir({ 'wrangler.toml': "main = 'src/index.ts'" });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe(join(dir, 'src/index.ts'));
  });

  it('prefers wrangler.json over wrangler.toml (matching wrangler itself)', () => {
    const dir = writeTempDir({
      'wrangler.toml': 'main = "from-toml.ts"',
      'wrangler.json': '{ "main": "from-json.ts" }',
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe(join(dir, 'from-json.ts'));
  });

  it('prefers wrangler.jsonc over wrangler.toml (matching wrangler itself)', () => {
    const dir = writeTempDir({
      'wrangler.toml': 'main = "from-toml.ts"',
      'wrangler.jsonc': '{ "main": "from-jsonc.ts" }',
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe(join(dir, 'from-jsonc.ts'));
  });

  it('handles TOML with commented-out bindings', () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "src/index.ts"',
        '',
        '# [[durable_objects.bindings]]',
        '# name = "IGNORED"',
        '# class_name = "IgnoredDO"',
        '',
        '[[durable_objects.bindings]]',
        'name = "REAL"',
        'class_name = "RealDO"',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.durableObjects).toEqual([{ name: 'REAL', className: 'RealDO' }]);
  });

  it('handles multiple DO bindings', () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "src/index.ts"',
        '',
        '[[durable_objects.bindings]]',
        'name = "DO_A"',
        'class_name = "A"',
        '',
        '[[durable_objects.bindings]]',
        'name = "DO_B"',
        'class_name = "B"',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.durableObjects).toHaveLength(2);
    expect(result!.config.durableObjects[0]).toEqual({ name: 'DO_A', className: 'A' });
    expect(result!.config.durableObjects[1]).toEqual({ name: 'DO_B', className: 'B' });
  });

  it('returns undefined when no config exists', () => {
    const dir = writeTempDir({});
    expect(resolveWranglerConfig(dir)).toBeUndefined();
  });

  it('returns undefined for explicit non-existent path', () => {
    expect(resolveWranglerConfig('/tmp', '/tmp/nonexistent.toml')).toBeUndefined();
  });

  it('resolves a relative explicit path against the root', () => {
    const dir = writeTempDir({ 'custom.toml': 'main = "src/index.ts"' });

    const result = resolveWranglerConfig(dir, 'custom.toml');
    expect(result).toBeDefined();
    expect(result!.config.main).toBe(join(dir, 'src/index.ts'));
    expect(result!.configDir).toBe(dir);
  });

  it('returns undefined for an empty config file instead of crashing', () => {
    const dir = writeTempDir({ 'wrangler.json': '' });
    expect(resolveWranglerConfig(dir)).toBeUndefined();
  });

  it('returns undefined for invalid TOML instead of crashing', () => {
    const dir = writeTempDir({ 'wrangler.toml': 'main = [' });
    expect(resolveWranglerConfig(dir)).toBeUndefined();
  });

  it('skips DO bindings with a script_name (class lives in another worker)', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        durable_objects: {
          bindings: [
            { name: 'LOCAL', class_name: 'LocalDO' },
            { name: 'EXTERNAL', class_name: 'ExternalDO', script_name: 'other-worker' },
          ],
        },
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.durableObjects).toEqual([{ name: 'LOCAL', className: 'LocalDO' }]);
  });

  it('uses only the active environment DO bindings (does not union across envs)', () => {
    // wrangler flattens to the active environment (top level here, since no
    // CLOUDFLARE_ENV), matching what the deployed Worker actually binds. A
    // class bound only in a non-active env is intentionally not included.
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        durable_objects: { bindings: [{ name: 'TOP', class_name: 'TopDO' }] },
        env: {
          production: {
            durable_objects: {
              bindings: [{ name: 'PROD_ONLY', class_name: 'ProdDO' }],
            },
          },
        },
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.durableObjects).toEqual([{ name: 'TOP', className: 'TopDO' }]);
  });

  it('honors CLOUDFLARE_ENV for both main and DO bindings', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        durable_objects: { bindings: [{ name: 'TOP', class_name: 'TopDO' }] },
        env: {
          staging: {
            main: 'src/staging.ts',
            durable_objects: { bindings: [{ name: 'STAGING_DO', class_name: 'StagingDO' }] },
          },
        },
      }),
    });

    const previous = process.env.CLOUDFLARE_ENV;
    process.env.CLOUDFLARE_ENV = 'staging';
    try {
      const result = resolveWranglerConfig(dir)!;
      expect(result.config.main).toBe(join(dir, 'src/staging.ts'));
      expect(result.config.durableObjects).toEqual([{ name: 'STAGING_DO', className: 'StagingDO' }]);
    } finally {
      if (previous === undefined) delete process.env.CLOUDFLARE_ENV;
      else process.env.CLOUDFLARE_ENV = previous;
    }
  });
});
