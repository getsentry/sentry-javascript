import { describe, expect, it } from 'vitest';
import { collectInstalledModules, parseDenoLockModules } from '../../../src/utils/installedModules';

function makeFs(files: Record<string, unknown>): (path: string) => string | undefined {
  return path => {
    const content = files[path];
    if (content === undefined) {
      return undefined;
    }
    return typeof content === 'string' ? content : JSON.stringify(content);
  };
}

describe('collectInstalledModules', () => {
  it('resolves declared dependencies to their installed versions and keeps the range of the rest', () => {
    const readFile = makeFs({
      '/app/package.json': {
        name: 'app',
        dependencies: { express: '^4.0.0', '@scope/lib': '^2.0.0' },
        devDependencies: { vitest: '^3.0.0' },
      },
      '/app/node_modules/express/package.json': { name: 'express', version: '4.21.2' },
      '/app/node_modules/@scope/lib/package.json': { name: '@scope/lib', version: '2.3.4' },
    });

    expect(collectInstalledModules({ readFile, entryPath: '/app/dist/index.js' })).toEqual({
      declared: { express: '^4.0.0', '@scope/lib': '^2.0.0', vitest: '^3.0.0' },
      installed: { express: '4.21.2', '@scope/lib': '2.3.4' },
    });
  });

  it('resolves packages hoisted to a monorepo root', () => {
    const readFile = makeFs({
      '/repo/package.json': { name: 'repo', devDependencies: { turbo: '^2.0.0' } },
      '/repo/apps/api/package.json': { name: 'api', dependencies: { hono: '^4.0.0' } },
      '/repo/node_modules/hono/package.json': { version: '4.6.0' },
    });

    expect(collectInstalledModules({ readFile, entryPath: '/repo/apps/api/dist/server.mjs', cwd: '/repo' })).toEqual({
      declared: { hono: '^4.0.0' },
      installed: { hono: '4.6.0' },
    });
  });

  it('skips package.json files that only configure a build output folder', () => {
    const readFile = makeFs({
      '/app/package.json': { name: 'app', dependencies: { koa: '^2.0.0' } },
      '/app/dist/package.json': { type: 'module' },
      '/app/node_modules/koa/package.json': { version: '2.15.3' },
    });

    expect(collectInstalledModules({ readFile, entryPath: '/app/dist/index.js' }).installed).toEqual({ koa: '2.15.3' });
  });

  it('uses cwd when the entry file is inside node_modules', () => {
    const readFile = makeFs({
      '/app/package.json': { name: 'app', dependencies: { next: '^15.0.0' } },
      '/app/node_modules/next/package.json': { name: 'next', version: '15.1.0' },
    });

    expect(
      collectInstalledModules({ readFile, entryPath: '/app/node_modules/next/dist/bin/next', cwd: '/app' }),
    ).toEqual({
      declared: { next: '^15.0.0' },
      installed: { next: '15.1.0' },
    });
  });

  it('prefers cwd when the entry file is outside of it', () => {
    const readFile = makeFs({
      '/var/runtime/package.json': { name: 'lambda-runtime', dependencies: { 'aws-sdk': '^2.0.0' } },
      '/var/task/package.json': { name: 'app', dependencies: { pg: '^8.0.0' } },
      '/var/task/node_modules/pg/package.json': { version: '8.13.1' },
    });

    expect(collectInstalledModules({ readFile, entryPath: '/var/runtime/index.mjs', cwd: '/var/task' })).toEqual({
      declared: { pg: '^8.0.0' },
      installed: { pg: '8.13.1' },
    });
  });

  it('uses the entry file when cwd has no package.json', () => {
    const readFile = makeFs({
      '/srv/app/package.json': { name: 'app', dependencies: { pg: '^8.0.0' } },
      '/srv/app/node_modules/pg/package.json': { version: '8.13.1' },
    });

    expect(collectInstalledModules({ readFile, entryPath: '/srv/app/index.js', cwd: '/' }).installed).toEqual({
      pg: '8.13.1',
    });
  });

  it('adds loaded packages from node_modules, including pnpm and Bun stores, and ignores other files', () => {
    const readFile = makeFs({
      '/app/package.json': { name: 'app', dependencies: {} },
      '/app/node_modules/.pnpm/debug@4.3.7/node_modules/debug/package.json': { version: '4.3.7' },
      '/app/node_modules/.bun/@scope+pkg@1.0.0/node_modules/@scope/pkg/package.json': { version: '1.0.0' },
      '/usr/lib/node_modules/pm2/package.json': { version: '5.0.0' },
    });

    expect(
      collectInstalledModules({
        readFile,
        entryPath: '/app/index.js',
        loadedFiles: [
          '/app/index.js',
          '/app/node_modules/.pnpm/debug@4.3.7/node_modules/debug/src/index.js',
          '/app/node_modules/.pnpm/debug@4.3.7/node_modules/debug/src/node.js',
          '/app/node_modules/.bun/@scope+pkg@1.0.0/node_modules/@scope/pkg/index.js',
          '/usr/lib/node_modules/pm2/index.js',
        ],
      }).installed,
    ).toEqual({ debug: '4.3.7', '@scope/pkg': '1.0.0' });
  });

  it('prefers the version that the app resolves when several versions of a package are loaded', () => {
    const readFile = makeFs({
      '/app/package.json': { name: 'app' },
      '/app/node_modules/ms/package.json': { version: '2.1.3' },
      '/app/node_modules/.pnpm/ms@2.0.0/node_modules/ms/package.json': { version: '2.0.0' },
      '/app/node_modules/.pnpm/ms@2.1.3/node_modules/ms/package.json': { version: '2.1.3' },
    });

    expect(
      collectInstalledModules({
        readFile,
        entryPath: '/app/index.js',
        loadedFiles: [
          '/app/node_modules/.pnpm/ms@2.0.0/node_modules/ms/index.js',
          '/app/node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js',
        ],
      }).installed,
    ).toEqual({ ms: '2.1.3' });
  });

  it('handles Windows paths', () => {
    const readFile = makeFs({
      'C:/app/package.json': { name: 'app', dependencies: { express: '^4.0.0' } },
      'C:/app/node_modules/express/package.json': { version: '4.21.2' },
    });

    expect(collectInstalledModules({ readFile, entryPath: 'C:\\app\\index.js' }).installed).toEqual({
      express: '4.21.2',
    });
  });

  it('returns nothing without a package.json', () => {
    expect(collectInstalledModules({ readFile: () => undefined, entryPath: '/app/index.js', cwd: '/' })).toEqual({
      declared: {},
      installed: {},
    });
  });
});

describe('parseDenoLockModules', () => {
  it('reads version 4 and 5 lockfiles', () => {
    expect(
      parseDenoLockModules(
        JSON.stringify({
          version: '5',
          specifiers: {
            'jsr:@std/assert@^1.0.0': '1.0.13',
            'npm:express@^4.18.2': '4.21.2',
            'npm:@types/react-dom@18': '18.3.0_@types+react@18.3.1',
          },
        }),
      ),
    ).toEqual({ '@std/assert': '1.0.13', express: '4.21.2', '@types/react-dom': '18.3.0' });
  });

  it('reads version 3 lockfiles', () => {
    expect(
      parseDenoLockModules(
        JSON.stringify({
          version: '3',
          packages: { specifiers: { 'npm:chalk@5': 'npm:chalk@5.3.0', 'jsr:@std/path@1': 'jsr:@std/path@1.0.8' } },
        }),
      ),
    ).toEqual({ chalk: '5.3.0', '@std/path': '1.0.8' });
  });

  it('returns nothing for invalid content', () => {
    expect(parseDenoLockModules('not json')).toEqual({});
    expect(parseDenoLockModules('{}')).toEqual({});
  });
});
