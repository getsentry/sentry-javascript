import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getNuxtBuildAssetsDir,
  getNuxtBuildAssetsPath,
  getNuxtPublicBuildAssetsUrl,
  getNuxtPublicFilePaths,
  NUXT_BUILD_ASSETS_DIR_GLOBAL,
  NUXT_CDN_URL_GLOBAL,
  NUXT_PUBLIC_FILES_GLOBAL,
} from '../../src/common/buildAssets';
import { NUXT_BASE_PATH_GLOBAL } from '../../src/common/tunnel';

const globalWithNuxtPaths = GLOBAL_OBJ as {
  [NUXT_BASE_PATH_GLOBAL]?: string;
  [NUXT_BUILD_ASSETS_DIR_GLOBAL]?: string;
  [NUXT_CDN_URL_GLOBAL]?: string;
  [NUXT_PUBLIC_FILES_GLOBAL]?: string[];
};

afterEach(() => {
  globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = undefined;
  globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = undefined;
  globalWithNuxtPaths[NUXT_CDN_URL_GLOBAL] = undefined;
  globalWithNuxtPaths[NUXT_PUBLIC_FILES_GLOBAL] = undefined;
});

describe('getNuxtBuildAssetsDir', () => {
  it('defaults to `/_nuxt/` when the generated code did not set the dir', () => {
    expect(getNuxtBuildAssetsDir()).toBe('/_nuxt/');
  });

  it.each([
    ['/_nuxt/', '/_nuxt/'],
    ['/assets/', '/assets/'],
    ['assets', '/assets/'],
    ['/static/build', '/static/build/'],
    ['//assets//', '/assets/'],
  ])('normalizes `%s` to `%s`', (configured, expected) => {
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = configured;

    expect(getNuxtBuildAssetsDir()).toBe(expected);
  });

  it.each(['/', '', '//'])('returns undefined for the root dir `%s`', configured => {
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = configured;

    expect(getNuxtBuildAssetsDir()).toBeUndefined();
  });
});

describe('getNuxtBuildAssetsPath', () => {
  it('defaults to `/_nuxt/` when the generated code did not set the paths', () => {
    expect(getNuxtBuildAssetsPath()).toBe('/_nuxt/');
  });

  it.each([
    ['/', '/_nuxt/', '/_nuxt/'],
    ['/app/', '/_nuxt/', '/app/_nuxt/'],
    ['/app', 'assets', '/app/assets/'],
    ['/shop/de/', '/static/build/', '/shop/de/static/build/'],
  ])('joins the base path `%s` and the dir `%s` to `%s`', (basePath, dir, expected) => {
    globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = basePath;
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = dir;

    expect(getNuxtBuildAssetsPath()).toBe(expected);
  });

  it('returns undefined for the root dir, also under a base path', () => {
    globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/app/';
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/';

    expect(getNuxtBuildAssetsPath()).toBeUndefined();
  });
});

describe('getNuxtPublicBuildAssetsUrl', () => {
  it('returns the build assets path without a cdnURL', () => {
    globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/app/';

    expect(getNuxtPublicBuildAssetsUrl()).toBe('/app/_nuxt/');
  });

  it.each([
    ['https://cdn.example.com', '/_nuxt/', 'https://cdn.example.com/_nuxt/'],
    ['https://cdn.example.com/app/', '/assets/', 'https://cdn.example.com/app/assets/'],
  ])('uses the cdnURL `%s` instead of the baseURL', (cdnURL, dir, expected) => {
    globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = '/ignored/';
    globalWithNuxtPaths[NUXT_CDN_URL_GLOBAL] = cdnURL;
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = dir;

    expect(getNuxtPublicBuildAssetsUrl()).toBe(expected);
  });

  it('returns undefined for the root dir, also with a cdnURL', () => {
    globalWithNuxtPaths[NUXT_CDN_URL_GLOBAL] = 'https://cdn.example.com/';
    globalWithNuxtPaths[NUXT_BUILD_ASSETS_DIR_GLOBAL] = '/';

    expect(getNuxtPublicBuildAssetsUrl()).toBeUndefined();
  });
});

describe('getNuxtPublicFilePaths', () => {
  it('returns no paths when the generated code did not set the files', () => {
    expect(getNuxtPublicFilePaths()).toEqual([]);
  });

  it.each([
    [undefined, ['/humans.txt', '/docs/guide.pdf']],
    ['/', ['/humans.txt', '/docs/guide.pdf']],
    ['/shop/', ['/shop/humans.txt', '/shop/docs/guide.pdf']],
    ['/shop', ['/shop/humans.txt', '/shop/docs/guide.pdf']],
  ])('prefixes the files with the base path `%s`', (basePath, expected) => {
    globalWithNuxtPaths[NUXT_BASE_PATH_GLOBAL] = basePath;
    globalWithNuxtPaths[NUXT_PUBLIC_FILES_GLOBAL] = ['/humans.txt', '/docs/guide.pdf'];

    expect(getNuxtPublicFilePaths()).toEqual(expected);
  });
});
