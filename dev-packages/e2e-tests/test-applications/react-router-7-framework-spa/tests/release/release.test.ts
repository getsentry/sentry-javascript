import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { RELEASE } from '../constants';

const CLIENT_BUILD = path.join(process.cwd(), 'build/client');

test.describe('release', () => {
  test('is in the SPA fallback page that the build renders', () => {
    const html = readFileSync(path.join(CLIENT_BUILD, 'index.html'), 'utf8');

    expect(html).toContain(`<meta name="sentry-release" content="${RELEASE}"/>`);
  });

  test('is not in the content-hashed client assets', () => {
    expect(filesContaining(path.join(CLIENT_BUILD, 'assets'), RELEASE)).toEqual([]);
  });
});

function filesContaining(dir: string, text: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name))
    .filter(file => readFileSync(file, 'utf8').includes(text));
}
