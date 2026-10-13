import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deletePublicSourceMaps } from '../../src/vite/sourceMapDeletion';

const BUILD_FILES = [
  '.output/public/_nuxt/entry.DxB3kLmA.js',
  '.output/public/_nuxt/entry.DxB3kLmA.js.map',
  '.output/public/_nuxt/pages/products.Cq81zR4t.js.map',
  '.output/public-assets/_nuxt/entry.DxB3kLmA.js.map',
  '.output/server/chunks/nitro/nitro.mjs.map',
  '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map',
];

let rootDir: string;
let publicDir: string;

/** Glob patterns need forward slashes, also on Windows. */
function toGlob(relativePattern: string): string {
  return path.join(rootDir, relativePattern).split(path.sep).join('/');
}

function remainingFiles(): string[] {
  return BUILD_FILES.filter(file => fs.existsSync(path.join(rootDir, file)));
}

describe('deletePublicSourceMaps', () => {
  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-source-map-deletion-'));
    publicDir = path.join(rootDir, '.output', 'public');

    for (const file of BUILD_FILES) {
      fs.mkdirSync(path.dirname(path.join(rootDir, file)), { recursive: true });
      fs.writeFileSync(path.join(rootDir, file), '');
    }
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('deletes the matched files in the public dir and keeps the matched files outside of it', async () => {
    await deletePublicSourceMaps(
      {
        sourcemaps: {
          filesToDeleteAfterUpload: [toGlob('.*/**/public*/**/*.map'), toGlob('.*/**/server/**/*.map')],
        },
      },
      publicDir,
    );

    expect(remainingFiles()).toEqual([
      '.output/public/_nuxt/entry.DxB3kLmA.js',
      '.output/public-assets/_nuxt/entry.DxB3kLmA.js.map',
      '.output/server/chunks/nitro/nitro.mjs.map',
      '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map',
    ]);
  });

  it('keeps the files in the public dir that no pattern matches', async () => {
    await deletePublicSourceMaps(
      { sourcemaps: { filesToDeleteAfterUpload: toGlob('.output/public/_nuxt/pages/*.map') } },
      publicDir,
    );

    expect(remainingFiles()).toEqual([
      '.output/public/_nuxt/entry.DxB3kLmA.js',
      '.output/public/_nuxt/entry.DxB3kLmA.js.map',
      '.output/public-assets/_nuxt/entry.DxB3kLmA.js.map',
      '.output/server/chunks/nitro/nitro.mjs.map',
      '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map',
    ]);
  });

  it('resolves a promised list of patterns', async () => {
    await deletePublicSourceMaps(
      { sourcemaps: { filesToDeleteAfterUpload: Promise.resolve([toGlob('.output/public/**/*.map')]) } },
      publicDir,
    );

    expect(remainingFiles()).toEqual([
      '.output/public/_nuxt/entry.DxB3kLmA.js',
      '.output/public-assets/_nuxt/entry.DxB3kLmA.js.map',
      '.output/server/chunks/nitro/nitro.mjs.map',
      '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map',
    ]);
  });

  it('deletes nothing when no deletion patterns are set', async () => {
    await deletePublicSourceMaps({ sourcemaps: {} }, publicDir);

    expect(remainingFiles()).toEqual(BUILD_FILES);
  });
});
