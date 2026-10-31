import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { globFiles } from '@sentry/bundler-plugins/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePublicSourceMaps, getFallbackFilesToDelete } from '../../src/vite/sourceMapDeletion';

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

/** Output directories of Nitro presets and the source maps a build writes there, relative to the Nuxt root. */
const PRESETS = {
  'node-server': {
    outputDirs: { publicDir: '.output/public', serverDir: '.output/server' },
    clientMaps: ['.output/public/_nuxt/entry.DxB3kLmA.js.map'],
    serverMaps: ['.output/server/chunks/nitro/nitro.mjs.map'],
  },
  netlify: {
    outputDirs: { publicDir: 'dist', serverDir: '.netlify/functions-internal/server' },
    clientMaps: ['dist/_nuxt/entry.DxB3kLmA.js.map'],
    serverMaps: ['.netlify/functions-internal/server/chunks/nitro/nitro.mjs.map'],
  },
  vercel: {
    outputDirs: { publicDir: '.vercel/output/static', serverDir: '.vercel/output/functions/__fallback.func' },
    clientMaps: ['.vercel/output/static/_nuxt/entry.DxB3kLmA.js.map'],
    serverMaps: ['.vercel/output/functions/__fallback.func/chunks/nitro/nitro.mjs.map'],
  },
  'cloudflare-pages': {
    outputDirs: { publicDir: 'dist', serverDir: 'dist/_worker.js' },
    clientMaps: ['dist/_nuxt/entry.DxB3kLmA.js.map', 'dist/sw.js.map'],
    serverMaps: ['dist/_worker.js/chunks/nitro/nitro.mjs.map'],
  },
};

type Preset = keyof typeof PRESETS;

/** Never deployed, so Sentry keeps them. */
const UNDEPLOYED_MAPS = [
  '.nuxt/dist/server/_nuxt/index-B2kR7mXp.mjs.map',
  'node_modules/vue/dist/vue.runtime.esm-bundler.js.map',
];

describe('getFallbackFilesToDelete', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-fallback-deletion-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeFiles(files: string[], nuxtRoot = projectDir): void {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(nuxtRoot, file)), { recursive: true });
      fs.writeFileSync(path.join(nuxtRoot, file), '');
    }
  }

  /** Writes the build output of a preset and returns the files that the fallback globs match, relative to the root. */
  async function matchFallbackFiles(
    preset: Preset,
    sides: { client: boolean; server: boolean },
    nuxtRoot = projectDir,
  ): Promise<string[]> {
    const { outputDirs, clientMaps, serverMaps } = PRESETS[preset];
    writeFiles([...clientMaps, ...serverMaps, ...UNDEPLOYED_MAPS], nuxtRoot);

    const globs = getFallbackFilesToDelete({
      ...sides,
      outputDirs: {
        publicDir: path.join(nuxtRoot, outputDirs.publicDir),
        serverDir: path.join(nuxtRoot, outputDirs.serverDir),
      },
    });
    const files = globs.length > 0 ? await globFiles(globs) : [];
    return files.map(file => path.relative(nuxtRoot, file).split(path.sep).join('/')).sort();
  }

  it.each(Object.keys(PRESETS) as Preset[])(
    'matches the client and server source maps in the output of the %s preset',
    async preset => {
      const { clientMaps, serverMaps } = PRESETS[preset];

      await expect(matchFallbackFiles(preset, { client: true, server: true })).resolves.toEqual(
        [...clientMaps, ...serverMaps].sort(),
      );
    },
  );

  it.each(Object.keys(PRESETS) as Preset[])(
    'matches only the client source maps of the %s preset when Sentry enabled only those',
    async preset => {
      await expect(matchFallbackFiles(preset, { client: true, server: false })).resolves.toEqual(
        [...PRESETS[preset].clientMaps].sort(),
      );
    },
  );

  it.each(Object.keys(PRESETS) as Preset[])(
    'matches only the server source maps of the %s preset when Sentry enabled only those',
    async preset => {
      await expect(matchFallbackFiles(preset, { client: false, server: true })).resolves.toEqual(
        PRESETS[preset].serverMaps,
      );
    },
  );

  it('matches the output of a Nuxt app in a subdirectory of the working directory', async () => {
    const nuxtRoot = path.join(projectDir, 'apps', 'shop');

    await expect(matchFallbackFiles('node-server', { client: true, server: false }, nuxtRoot)).resolves.toEqual(
      PRESETS['node-server'].clientMaps,
    );
  });

  it('returns no globs before Nitro reported its output directories', () => {
    expect(getFallbackFilesToDelete({ client: true, server: true })).toEqual([]);
  });
});
