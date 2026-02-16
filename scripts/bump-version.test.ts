import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const { bumpVersions } = require('./bump-version');

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-test-'));
}

function writePackageJson(dir: string, content: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(content, null, 2) + '\n');
}

function readPackageJson(dir: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
}

function setupFixture({
  workspaces,
  packages,
}: {
  workspaces?: string[];
  packages: Record<string, Record<string, unknown>>;
}): string {
  const rootDir = createTempDir();

  const workspaceEntries: string[] = [];
  for (const [dirName, pkgContent] of Object.entries(packages)) {
    writePackageJson(path.join(rootDir, dirName), pkgContent);
    workspaceEntries.push(dirName);
  }

  writePackageJson(rootDir, {
    private: true,
    name: 'test-monorepo',
    version: '0.0.0',
    workspaces: workspaces || workspaceEntries,
  });

  return rootDir;
}

describe('bump-version', () => {
  const tempDirs: string[] = [];

  function tracked(dir: string): string {
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('bumps version in all workspace packages', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/browser': { name: '@sentry/browser', version: '10.0.0' },
          'packages/node': { name: '@sentry/node', version: '10.0.0' },
        },
      }),
    );

    const count = bumpVersions(rootDir, '10.1.0');
    expect(count).toBe(3);
    expect(readPackageJson(path.join(rootDir, 'packages/core')).version).toBe('10.1.0');
    expect(readPackageJson(path.join(rootDir, 'packages/browser')).version).toBe('10.1.0');
    expect(readPackageJson(path.join(rootDir, 'packages/node')).version).toBe('10.1.0');
  });

  it('updates internal workspace dependencies to exact new version', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/browser': {
            name: '@sentry/browser',
            version: '10.0.0',
            dependencies: { '@sentry/core': '10.0.0' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    expect(readPackageJson(path.join(rootDir, 'packages/browser')).dependencies['@sentry/core']).toBe('10.1.0');
  });

  it('updates devDependencies and peerDependencies for workspace packages', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/utils': { name: '@sentry/utils', version: '10.0.0' },
          'packages/browser': {
            name: '@sentry/browser',
            version: '10.0.0',
            dependencies: { '@sentry/core': '10.0.0' },
            devDependencies: { '@sentry/utils': '10.0.0' },
            peerDependencies: { '@sentry/core': '10.0.0' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    expect(browser.dependencies['@sentry/core']).toBe('10.1.0');
    expect(browser.devDependencies['@sentry/utils']).toBe('10.1.0');
    expect(browser.peerDependencies['@sentry/core']).toBe('10.1.0');
  });

  it('does not modify external (non-workspace) dependencies', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/browser': {
            name: '@sentry/browser',
            version: '10.0.0',
            dependencies: {
              '@sentry/core': '10.0.0',
              'some-external-pkg': '^3.0.0',
              'another-pkg': '~2.1.0',
            },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    const browser = readPackageJson(path.join(rootDir, 'packages/browser'));
    expect(browser.dependencies['some-external-pkg']).toBe('^3.0.0');
    expect(browser.dependencies['another-pkg']).toBe('~2.1.0');
    expect(browser.dependencies['@sentry/core']).toBe('10.1.0');
  });

  it('updates workspace deps even if their version is out of sync (force-publish behavior)', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/browser': {
            name: '@sentry/browser',
            version: '10.0.0',
            dependencies: { '@sentry/core': '9.99.0' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    expect(readPackageJson(path.join(rootDir, 'packages/browser')).dependencies['@sentry/core']).toBe('10.1.0');
  });

  it('does not modify root package.json version', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    expect(readPackageJson(rootDir).version).toBe('0.0.0');
  });

  it('preserves package.json fields that are not version-related', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': {
            name: '@sentry/core',
            version: '10.0.0',
            description: 'Sentry core',
            main: 'dist/index.js',
            license: 'MIT',
            keywords: ['sentry', 'error-tracking'],
            dependencies: { 'some-lib': '^1.0.0' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    const core = readPackageJson(path.join(rootDir, 'packages/core'));
    expect(core.version).toBe('10.1.0');
    expect(core.description).toBe('Sentry core');
    expect(core.main).toBe('dist/index.js');
    expect(core.license).toBe('MIT');
    expect(core.dependencies['some-lib']).toBe('^1.0.0');
    expect(core.keywords).toEqual(['sentry', 'error-tracking']);
  });

  it('handles packages with no dependencies at all', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
        },
      }),
    );

    const count = bumpVersions(rootDir, '10.1.0');
    expect(count).toBe(1);
    expect(readPackageJson(path.join(rootDir, 'packages/core')).version).toBe('10.1.0');
  });

  it('skips workspace: protocol dependencies', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'packages/browser': {
            name: '@sentry/browser',
            version: '10.0.0',
            dependencies: { '@sentry/core': 'workspace:*' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    expect(readPackageJson(path.join(rootDir, 'packages/browser')).dependencies['@sentry/core']).toBe('workspace:*');
  });

  it('handles dev-packages workspaces alongside regular packages', () => {
    const rootDir = tracked(
      setupFixture({
        packages: {
          'packages/core': { name: '@sentry/core', version: '10.0.0' },
          'dev-packages/test-utils': {
            name: '@sentry-internal/test-utils',
            version: '10.0.0',
            devDependencies: { '@sentry/core': '10.0.0' },
          },
        },
      }),
    );

    bumpVersions(rootDir, '10.1.0');
    const testUtils = readPackageJson(path.join(rootDir, 'dev-packages/test-utils'));
    expect(testUtils.version).toBe('10.1.0');
    expect(testUtils.devDependencies['@sentry/core']).toBe('10.1.0');
  });

  it('throws when root package.json has no workspaces', () => {
    const rootDir = tracked(createTempDir());
    writePackageJson(rootDir, { name: 'bad-root', version: '1.0.0' });

    expect(() => bumpVersions(rootDir, '2.0.0')).toThrow('workspaces');
  });

  it('throws when a workspace package.json is unreadable and does not partially update', () => {
    const rootDir = tracked(createTempDir());
    writePackageJson(rootDir, {
      private: true,
      name: 'test-monorepo',
      version: '0.0.0',
      workspaces: ['packages/core', 'packages/missing'],
    });
    writePackageJson(path.join(rootDir, 'packages/core'), { name: '@sentry/core', version: '10.0.0' });

    expect(() => bumpVersions(rootDir, '10.1.0')).toThrow();
    expect(readPackageJson(path.join(rootDir, 'packages/core')).version).toBe('10.0.0');
  });
});
