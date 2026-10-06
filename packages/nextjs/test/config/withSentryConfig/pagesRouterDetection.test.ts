import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { hasOnlyAppRouterPages } from '../../../src/config/withSentryConfig/pagesRouterDetection';

const tmpDirs: string[] = [];

function makeProject(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nextjs-router-detection-'));
  tmpDirs.push(dir);
  for (const file of files) {
    const absolute = path.join(dir, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('hasOnlyAppRouterPages', () => {
  it.each([
    ['an `app` dir and no `pages` dir', ['app/page.tsx']],
    ['a `src/app` dir and no `pages` dir', ['src/app/page.tsx']],
    [
      'an `app` dir and only API routes under `pages/api`',
      ['app/page.tsx', 'pages/api/hello.ts', 'pages/api/v1/nested.ts'],
    ],
    ['an `app` dir and only API routes under `src/pages/api`', ['src/app/page.tsx', 'src/pages/api/hello.ts']],
  ])('returns true for %s', (_description, files) => {
    expect(hasOnlyAppRouterPages(makeProject(files))).toBe(true);
  });

  it.each([
    ['a page in `pages`', ['app/page.tsx', 'pages/index.tsx']],
    ['a nested page in `pages`', ['app/page.tsx', 'pages/blog/[slug].tsx']],
    ['a page in `src/pages`', ['src/app/page.tsx', 'src/pages/about.tsx']],
    ['`pages` special files only, which still render through the Pages Router', ['app/page.tsx', 'pages/_app.tsx']],
    ['a page with a custom page extension', ['app/page.tsx', 'pages/index.page.mdx']],
  ])('returns false when an `app` dir project also has %s', (_description, files) => {
    expect(hasOnlyAppRouterPages(makeProject(files))).toBe(false);
  });

  it.each([
    ['no `app` dir and no `pages` dir', ['package.json']],
    ['no `app` dir but a `pages` dir', ['pages/index.tsx']],
    ['no `app` dir and only API routes', ['pages/api/hello.ts']],
  ])('returns false when the router type cannot be determined: %s', (_description, files) => {
    expect(hasOnlyAppRouterPages(makeProject(files))).toBe(false);
  });

  it('returns false for a directory that does not exist', () => {
    expect(hasOnlyAppRouterPages(path.join(os.tmpdir(), `sentry-does-not-exist-${Date.now()}`))).toBe(false);
  });
});
