import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commonJSDependencyNames } from '../../src/orchestrion/bundler/commonJSDependencies';

function installPackage(parentDir: string, name: string, manifest: Record<string, unknown> = {}): string {
  const dir = join(parentDir, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }));
  return dir;
}

describe('commonJSDependencyNames', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'orch-cjs-deps-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('collects the dependencies of a CommonJS package transitively', () => {
    installPackage(root, 'pg', { dependencies: { 'pg-types': '^2' } });
    installPackage(root, 'pg-types', { dependencies: { 'postgres-array': '~2' } });
    installPackage(root, 'postgres-array');

    expect(commonJSDependencyNames(root, ['pg']).sort()).toEqual(['pg-types', 'postgres-array']);
  });

  it.each([
    ['an optional', { dependencies: { dep: '^1' }, optionalDependencies: { dep: '^1' } }],
    ['a peer', { peerDependencies: { dep: '^1' } }],
  ])('skips %s dependency', (_, manifest) => {
    installPackage(root, 'pg', manifest);
    installPackage(root, 'dep');

    expect(commonJSDependencyNames(root, ['pg'])).toEqual([]);
  });

  it('skips a dependency that is not installed', () => {
    installPackage(root, 'pg', { dependencies: { 'not-installed': '^1' } });

    expect(commonJSDependencyNames(root, ['pg'])).toEqual([]);
  });

  it('includes an ESM dependency but not its own dependencies', () => {
    installPackage(root, 'mysql', { dependencies: { 'esm-only': '^1' } });
    installPackage(root, 'esm-only', { type: 'module', dependencies: { 'esm-dep': '^1' } });
    installPackage(root, 'esm-dep');

    expect(commonJSDependencyNames(root, ['mysql'])).toEqual(['esm-only']);
  });

  it.each([{ module: './esm/index.js' }, { type: 'module' }])(
    'skips an instrumented package with an ESM entry (%o)',
    manifest => {
      installPackage(root, 'graphql', { ...manifest, dependencies: { dep: '^1' } });
      installPackage(root, 'dep');

      expect(commonJSDependencyNames(root, ['graphql'])).toEqual([]);
    },
  );

  it('resolves dependencies from the real location of a symlinked package', () => {
    const store = join(root, 'node_modules/.pnpm/ioredis@5.0.0');
    const realDir = installPackage(store, 'ioredis', { dependencies: { denque: '^2' } });
    installPackage(store, 'denque');
    symlinkSync(realDir, join(root, 'node_modules/ioredis'), 'dir');

    expect(commonJSDependencyNames(root, ['ioredis'])).toEqual(['denque']);
  });
});
