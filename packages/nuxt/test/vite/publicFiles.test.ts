import type { Nuxt } from '@nuxt/schema';
import type { Nitro } from 'nitropack';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLayerPublicFilePaths, getNitroPublicFilePaths } from '../../src/vite/publicFiles';

const getLayerDirectoriesMock = vi.hoisted(() => vi.fn());

vi.mock('@nuxt/kit', () => ({ getLayerDirectories: getLayerDirectoriesMock }));

let rootDir: string;

function writeFiles(dir: string, files: string[]): string {
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), '');
  }
  return dir;
}

function createNuxt(baseURL = '/'): Nuxt {
  return { options: { buildDir: path.join(rootDir, '.nuxt'), app: { baseURL } } } as unknown as Nuxt;
}

function createNitro(publicAssets: { dir: string; baseURL?: string }[]): Nitro {
  return { options: { publicAssets } } as unknown as Nitro;
}

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nuxt-public-files-'));
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe('getNitroPublicFilePaths', () => {
  it('returns the files of all public dirs, also nested ones', () => {
    const publicDir = writeFiles(path.join(rootDir, 'public'), ['humans.txt', 'docs/guide.pdf']);
    const layerDir = writeFiles(path.join(rootDir, 'layer/public'), ['terms.html']);

    const paths = getNitroPublicFilePaths(createNitro([{ dir: publicDir }, { dir: layerDir }]), createNuxt());

    expect(paths.sort()).toEqual(['/docs/guide.pdf', '/humans.txt', '/terms.html']);
  });

  it('prefixes the files with the `baseURL` of their public dir', () => {
    const publicDir = writeFiles(path.join(rootDir, 'content'), ['guide.pdf']);

    expect(getNitroPublicFilePaths(createNitro([{ dir: publicDir, baseURL: '/docs/' }]), createNuxt())).toEqual([
      '/docs/guide.pdf',
    ]);
  });

  it('skips the client build, which the build asset filter covers', () => {
    const clientBuildDir = writeFiles(path.join(rootDir, '.nuxt/dist/client'), ['_nuxt/builds/latest.json']);

    expect(getNitroPublicFilePaths(createNitro([{ dir: clientBuildDir }]), createNuxt())).toEqual([]);
  });

  it('skips files that the HTTP integration ignores as static assets', () => {
    const publicDir = writeFiles(path.join(rootDir, 'public'), ['favicon.ico', 'robots.txt', 'logo.svg', 'humans.txt']);

    expect(getNitroPublicFilePaths(createNitro([{ dir: publicDir }]), createNuxt())).toEqual(['/humans.txt']);
  });

  it('keeps metadata files that the HTTP integration only ignores at the root, under a `baseURL`', () => {
    const publicDir = writeFiles(path.join(rootDir, 'public'), ['robots.txt']);

    expect(getNitroPublicFilePaths(createNitro([{ dir: publicDir }]), createNuxt('/shop/'))).toEqual(['/robots.txt']);
  });

  it('returns no paths for a public dir that does not exist', () => {
    expect(getNitroPublicFilePaths(createNitro([{ dir: path.join(rootDir, 'missing') }]), createNuxt())).toEqual([]);
  });
});

describe('getLayerPublicFilePaths', () => {
  it('returns the files of the public dirs of all layers', () => {
    const publicDir = writeFiles(path.join(rootDir, 'public'), ['humans.txt']);
    const layerDir = writeFiles(path.join(rootDir, 'layer/public'), ['docs/guide.pdf', 'favicon.ico']);
    getLayerDirectoriesMock.mockReturnValue([{ public: `${publicDir}/` }, { public: `${layerDir}/` }]);

    expect(getLayerPublicFilePaths(createNuxt()).sort()).toEqual(['/docs/guide.pdf', '/humans.txt']);
  });
});
