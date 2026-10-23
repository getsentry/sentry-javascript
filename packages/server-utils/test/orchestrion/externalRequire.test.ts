import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExternalRequireResolver } from '../../src/orchestrion/bundler/externalRequire';

interface ContextOptions {
  environment?: string;
  meta?: Record<string, string>;
  mode?: string;
  external?: string[] | true;
  resolved?: { id: string; external?: boolean } | null;
}

describe('createExternalRequireResolver', () => {
  let root: string;
  let pgFile: string;

  function installPackage(name: string, manifest: Record<string, unknown> = {}, parentDir = root): string {
    const dir = join(parentDir, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, main: 'index.js', ...manifest }));
    writeFileSync(join(dir, 'index.js'), '');
    return join(dir, 'index.js');
  }

  // By default, a Rolldown build in which Vite keeps the required package external.
  function context({
    environment = 'ssr',
    meta = { rolldownVersion: '1.2.14' },
    mode = 'build',
    external = [],
    resolved = { id: 'external', external: true },
  }: ContextOptions = {}): never {
    return {
      meta,
      environment: { name: environment, mode, config: { resolve: { external } } },
      resolve: vi.fn().mockResolvedValue(resolved),
    } as never;
  }

  function resolveRequire(
    resolver: ReturnType<typeof createExternalRequireResolver>,
    source: string,
    importer: string,
    contextOptions?: ContextOptions,
    kind = 'require-call',
  ): Promise<string | null> {
    return resolver.call(context(contextOptions), source, importer, { kind, isEntry: false } as never);
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orch-external-require-')));
    pgFile = join(root, 'node_modules/pg/lib/client.js');
    installPackage('pg');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('bundles an external package that an instrumented package requires', async () => {
    const pgTypes = installPackage('pg-types');

    await expect(resolveRequire(createExternalRequireResolver(['pg']), 'pg-types', pgFile)).resolves.toBe(pgTypes);
  });

  it.each([
    ['it bundled', { id: 'external', external: true }],
    ['Vite bundles itself', { id: 'pg-types/index.js' }],
  ])('follows the requires of a package that %s', async (_, resolved) => {
    const pgTypes = installPackage('pg-types');
    const postgresArray = installPackage('postgres-array');
    const resolver = createExternalRequireResolver(['pg']);

    await resolveRequire(resolver, 'pg-types', pgFile, { resolved });

    await expect(resolveRequire(resolver, 'postgres-array', pgTypes)).resolves.toBe(postgresArray);
  });

  // Every require() here resolves to a real file, so only the filter can return `null`.
  it.each([
    ['app code', 'pg-types', 'src/db.js'],
    ['a package that orchestrion does not bundle', 'pg-types', 'node_modules/other/index.js'],
    ['a builtin', 'node:net', 'node_modules/pg/lib/client.js'],
    ['a relative path', './connection', 'node_modules/pg/lib/client.js'],
  ])('ignores a require() of %s', async (_, source, importer) => {
    installPackage('pg-types');
    installPackage('other');
    mkdirSync(join(root, 'node_modules/pg/lib'), { recursive: true });
    writeFileSync(join(root, 'node_modules/pg/lib/connection.js'), '');

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), source, join(root, importer)),
    ).resolves.toBeNull();
  });

  it('bundles a require() from a pnpm store path', async () => {
    const store = join(root, 'node_modules/.pnpm/pg@8.23.1');
    installPackage('pg', {}, store);
    const pgTypes = installPackage('pg-types', {}, store);

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), 'pg-types', join(store, 'node_modules/pg/lib/client.js')),
    ).resolves.toBe(pgTypes);
  });

  it('tracks bundled packages for each environment separately', async () => {
    const pgTypes = installPackage('pg-types');
    installPackage('postgres-array');
    const resolver = createExternalRequireResolver(['pg']);

    await resolveRequire(resolver, 'pg-types', pgFile, { environment: 'ssr' });

    await expect(resolveRequire(resolver, 'postgres-array', pgTypes, { environment: 'nitro' })).resolves.toBeNull();
  });

  it.each([
    ['on Rollup', { meta: { rollupVersion: '4.0.0' } }, 'require-call'],
    ['on the dev server', { mode: 'dev' }, 'require-call'],
    ['for an import', {}, 'import-statement'],
  ])('leaves resolution to the bundler %s', async (_, contextOptions, kind) => {
    installPackage('pg-types');

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), 'pg-types', pgFile, contextOptions, kind),
    ).resolves.toBeNull();
  });

  it.each([
    ['an optional peer', { peerDependenciesMeta: { 'pg-native': { optional: true } } }],
    ['an optional dependency', { optionalDependencies: { 'pg-native': '^3' } }],
  ])('keeps %s external', async (_, manifest) => {
    installPackage('pg', manifest);
    installPackage('pg-native');

    await expect(resolveRequire(createExternalRequireResolver(['pg']), 'pg-native', pgFile)).resolves.toBeNull();
  });

  it('keeps a scoped subpath external when the user lists its package', async () => {
    installPackage('@scope/pkg');
    writeFileSync(join(root, 'node_modules/@scope/pkg/sub.js'), '');

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), '@scope/pkg/sub', pgFile, { external: ['@scope/pkg'] }),
    ).resolves.toBeNull();
  });

  it('keeps a package external that the user lists in `external`', async () => {
    installPackage('pg-types');

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), 'pg-types', pgFile, { external: ['pg-types'] }),
    ).resolves.toBeNull();
  });

  it.each([
    ['only a subpath of the package', ['pg-types/lib/arrays']],
    ['`true`, the SSR default', true],
  ] as const)('bundles a package despite an external entry that names %s', async (_, external) => {
    const pgTypes = installPackage('pg-types');

    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), 'pg-types', pgFile, {
        external: external === true ? true : [...external],
      }),
    ).resolves.toBe(pgTypes);
  });

  it('keeps a package external that is not installed', async () => {
    await expect(
      resolveRequire(createExternalRequireResolver(['pg']), 'not-installed-package', pgFile),
    ).resolves.toBeNull();
  });
});
