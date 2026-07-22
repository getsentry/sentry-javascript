import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';
import { resolveWranglerConfig } from '../../src/vite/wranglerConfig';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function writeTempDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sentry-cf-'));
  tempDirs.push(dir);
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

  it('parses workflow bindings', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        workflows: [
          { name: 'my-workflow', binding: 'MY_WF', class_name: 'MyWorkflow' },
          { name: 'other', binding: 'OTHER_WF', class_name: 'OtherWorkflow' },
        ],
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workflows).toEqual([
      { name: 'my-workflow', className: 'MyWorkflow' },
      { name: 'other', className: 'OtherWorkflow' },
    ]);
  });

  it('parses workflow bindings from TOML', () => {
    const dir = writeTempDir({
      'wrangler.toml': [
        'main = "src/index.ts"',
        '',
        '[[workflows]]',
        'name = "my-workflow"',
        'binding = "MY_WF"',
        'class_name = "MyWorkflow"',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workflows).toEqual([{ name: 'my-workflow', className: 'MyWorkflow' }]);
  });

  it('skips workflow bindings with a script_name (class lives in another worker)', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        workflows: [
          { name: 'local', binding: 'LOCAL_WF', class_name: 'LocalWorkflow' },
          { name: 'external', binding: 'EXT_WF', class_name: 'ExternalWorkflow', script_name: 'other-worker' },
        ],
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workflows).toEqual([{ name: 'local', className: 'LocalWorkflow' }]);
  });

  it('defaults workflows to an empty array when none are configured', () => {
    const dir = writeTempDir({ 'wrangler.json': JSON.stringify({ main: 'src/index.ts' }) });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workflows).toEqual([]);
  });

  it('collects a self-bound service entrypoint', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        name: 'worker-self',
        main: 'src/index.ts',
        services: [{ binding: 'SELF', service: 'worker-self', entrypoint: 'InternalEntry' }],
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workerEntrypoints).toEqual(['InternalEntry']);
  });

  it('collects multiple self-bound entrypoints from a wrangler.jsonc', () => {
    // Mirrors the `worker-workerentrypoint-rpc` integration test's config shape:
    // several `services[].entrypoint` entries in a JSONC file (comments +
    // trailing commas), all self-bound to this worker.
    const dir = writeTempDir({
      'wrangler.jsonc': [
        '{',
        '  // Worker exposing two named entrypoints to itself',
        '  "name": "my-worker",',
        '  "main": "index.ts",',
        '  "services": [',
        '    { "binding": "SELF_A", "service": "my-worker", "entrypoint": "BindingEntrypoint" },',
        '    { "binding": "SELF_B", "service": "my-worker", "entrypoint": "NoPropagationEntrypoint" },',
        '  ],',
        '}',
      ].join('\n'),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workerEntrypoints).toEqual(['BindingEntrypoint', 'NoPropagationEntrypoint']);
  });

  it("ignores outward service entrypoints (they name another worker's export)", () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        name: 'worker-self',
        main: 'src/index.ts',
        services: [
          { binding: 'SELF', service: 'worker-self', entrypoint: 'InternalEntry' },
          { binding: 'OTHER', service: 'worker-x', entrypoint: 'RemoteEntry' },
        ],
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workerEntrypoints).toEqual(['InternalEntry']);
  });

  it('derives no entrypoints when the worker has no name', () => {
    const dir = writeTempDir({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        services: [{ binding: 'S', service: 'x', entrypoint: 'E' }],
      }),
    });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workerEntrypoints).toEqual([]);
  });

  it('defaults workerEntrypoints to an empty array when no services are configured', () => {
    const dir = writeTempDir({ 'wrangler.json': JSON.stringify({ name: 'w', main: 'src/index.ts' }) });

    const result = resolveWranglerConfig(dir);
    expect(result!.config.workerEntrypoints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// What `unstable_readConfig` exposes about service-binding `entrypoint`.
//
// These characterize the wrangler API directly (not our wrapper) to justify a
// design decision: a service binding's `entrypoint` names a *named export on
// the target worker being bound to*, not an entrypoint this worker exposes.
// So it cannot, in general, tell auto-wrap which of *this* worker's exports is
// a handler — with one exception: a self-binding (`service === own name`).
// ---------------------------------------------------------------------------

describe('unstable_readConfig: service-binding entrypoint semantics', () => {
  function readConfig(files: Record<string, string>) {
    const dir = writeTempDir(files);
    return unstable_readConfig({ config: join(dir, Object.keys(files)[0]!) }, { hideWarnings: true });
  }

  it('resolves `main` to an absolute path', () => {
    const raw = readConfig({
      'wrangler.json': JSON.stringify({ main: 'src/index.ts', compatibility_date: '2024-01-01' }),
    });
    // Not the literal `src/index.ts` from the file — wrangler resolves it.
    expect(raw.main).not.toBe('src/index.ts');
    expect(raw.main?.endsWith(join('src', 'index.ts'))).toBe(true);
  });

  it("an outward service binding names the *target* worker's export, not ours", () => {
    const raw = readConfig({
      'wrangler.json': JSON.stringify({
        name: 'worker-a',
        main: 'src/index.ts',
        compatibility_date: '2024-01-01',
        services: [{ binding: 'MY_SVC', service: 'worker-b', entrypoint: 'SomeEntry' }],
      }),
    });

    expect(raw.name).toBe('worker-a');
    // `entrypoint` belongs to `worker-b`, a different worker this build isn't
    // compiling — nothing in *our* entry file to wrap from this.
    expect(raw.services).toEqual([{ binding: 'MY_SVC', service: 'worker-b', entrypoint: 'SomeEntry' }]);
    expect(raw.services?.[0]?.service).not.toBe(raw.name);
  });

  it('a self-binding (service === own name) does name one of *our* exports', () => {
    const raw = readConfig({
      'wrangler.json': JSON.stringify({
        name: 'worker-self',
        main: 'src/index.ts',
        compatibility_date: '2024-01-01',
        services: [
          { binding: 'SELF', service: 'worker-self', entrypoint: 'InternalEntry' },
          { binding: 'OTHER', service: 'worker-x', entrypoint: 'RemoteEntry' },
        ],
      }),
    });

    // Only the self-bound entrypoint is ours; the other points at `worker-x`.
    const ownEntrypoints = (raw.services ?? []).filter(s => s.service === raw.name).map(s => s.entrypoint);
    expect(ownEntrypoints).toEqual(['InternalEntry']);
  });

  it('leaves `name` undefined when the config omits it (no self-binding is derivable)', () => {
    const raw = readConfig({
      'wrangler.json': JSON.stringify({
        main: 'src/index.ts',
        compatibility_date: '2024-01-01',
        services: [{ binding: 'S', service: 'x', entrypoint: 'E' }],
      }),
    });

    // Without a worker name there is no `service === name` to match against, so
    // even self-bindings can't be identified.
    expect(raw.name).toBeUndefined();
    expect(raw.topLevelName).toBeUndefined();
  });
});
