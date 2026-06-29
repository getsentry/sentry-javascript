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
    expect(result!.config.main).toBe('src/index.ts');
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
    expect(result!.config.main).toBe('src/worker.ts');
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
    expect(result!.config.main).toBe('src/index.ts');
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
    expect(result!.config.main).toBe('src/index.ts');
    expect(result!.config.durableObjects).toEqual([{ name: 'DO', className: 'MyDO' }]);
  });

  it('parses TOML single-quoted (literal) strings', () => {
    const dir = writeTempDir({ 'wrangler.toml': "main = 'src/index.ts'" });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe('src/index.ts');
  });

  it('prefers wrangler.toml over wrangler.json', () => {
    const dir = writeTempDir({
      'wrangler.toml': 'main = "from-toml.ts"',
      'wrangler.json': '{ "main": "from-json.ts" }',
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.main).toBe('from-toml.ts');
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
});
