import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { escape as escapeGlob } from 'glob';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { globFiles } from '../../src/core/glob';
import { createUploadFilter } from '../../src/core/upload-filter';
import { normalizeUserOptions } from '../../src/core/options-mapping';

function filter(sourcemaps: { assets?: string | string[]; ignore?: string | string[] }) {
  return createUploadFilter(normalizeUserOptions({ sourcemaps }));
}

const inDist = path.resolve('dist/app/main.js');
const vendor = path.resolve('dist/app/vendor-abc.js');
const elsewhere = path.resolve('other/main.js');

describe('createUploadFilter', () => {
  it('accepts every file when neither option is set', () => {
    expect(filter({})(inDist)).toBe(true);
    expect(filter({})(elsewhere)).toBe(true);
  });

  it('accepts only files matching `assets`, resolved against the working directory', () => {
    const shouldUpload = filter({ assets: 'dist/**' });
    expect(shouldUpload(inDist)).toBe(true);
    expect(shouldUpload('dist/app/main.js')).toBe(true);
    expect(shouldUpload(elsewhere)).toBe(false);
  });

  it('accepts files matching any of several `assets` patterns', () => {
    const shouldUpload = filter({ assets: ['other/*.js', path.resolve('dist/**/*.js')] });
    expect(shouldUpload(inDist)).toBe(true);
    expect(shouldUpload(elsewhere)).toBe(true);
    expect(shouldUpload(path.resolve('dist/app/styles.css'))).toBe(false);
  });

  it('rejects everything for an empty `assets` list', () => {
    expect(filter({ assets: [] })(inDist)).toBe(false);
  });

  it('matches `**` patterns against files outside the working directory, like `glob`', () => {
    const outside = path.join(path.parse(process.cwd()).root, 'tmp', 'build', 'vendor-abc.js');
    expect(filter({ ignore: '**/vendor-*.js' })(outside)).toBe(false);
    expect(filter({ ignore: 'vendor-*.js' })(outside)).toBe(true);
  });

  it('rejects files matching `ignore`', () => {
    const shouldUpload = filter({ ignore: ['**/vendor-*.js'] });
    expect(shouldUpload(inDist)).toBe(true);
    expect(shouldUpload(vendor)).toBe(false);
  });

  it('skips dot files and folders for `assets` unless a pattern names them, like `glob`', () => {
    const hidden = path.resolve('.next/static/chunks/main.js');
    expect(filter({ assets: '**/*.js' })(hidden)).toBe(false);
    expect(filter({ assets: '.next/**/*.js' })(hidden)).toBe(true);
    expect(filter({ assets: '**/*.js' })(inDist)).toBe(true);
  });

  it('matches dot files and folders for `ignore`, like `glob`', () => {
    const hidden = path.resolve('.next/static/chunks/main.js');
    expect(filter({ ignore: '**/*.js' })(hidden)).toBe(false);
    expect(filter({ assets: '.next/**/*.js', ignore: '**/chunks/*.js' })(hidden)).toBe(false);
  });

  it('applies `ignore` after `assets`', () => {
    const shouldUpload = filter({ assets: 'dist/**', ignore: 'dist/app/vendor-*.js' });
    expect(shouldUpload(inDist)).toBe(true);
    expect(shouldUpload(vendor)).toBe(false);
  });
});

describe('createUploadFilter and the upload from disk', () => {
  let root: string;
  let files: string[];
  // Shares only the file system root with the working directory of the test.
  const farAway = __filename;
  const farAwayPattern = escapeGlob(farAway.split(path.sep).join('/'));

  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-upload-filter-')));
    files = ['app/dist/main.js', 'app/dist/vendor.js', 'app/.cache/chunk.js', 'lib/dist/main.js', 'lib/dist/util.js']
      .map(file => path.join(root, file))
      .concat(farAway);
    for (const file of files.slice(0, -1)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '');
    }
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'app'));
  });

  afterAll(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each<{ assets: string[]; ignore?: string[] }>([
    { assets: ['dist/**'] },
    { assets: ['./dist/*.js'] },
    { assets: ['**/*.js'] },
    { assets: ['**/*'] },
    { assets: ['.cache/**'] },
    { assets: ['{dist,.cache}/*.js'] },
    { assets: ['../lib/**/*.js'] },
    { assets: ['../lib/dist/main.js'] },
    { assets: ['../**/*.js'] },
    { assets: ['../*/dist/main.js'] },
    { assets: ['../../*/lib/dist/*.js'] },
    { assets: ['dist/../../lib/dist/util.js'] },
    { assets: [farAwayPattern] },
    { assets: ['../**/*.js'], ignore: ['../lib/**'] },
    { assets: ['../**/*.js'], ignore: ['../lib/dist/main.js'] },
    { assets: ['../**/*.js'], ignore: ['../**/main.js'] },
    { assets: ['../**/*.js'], ignore: ['**/main.js'] },
    { assets: ['../**/*.js'], ignore: ['./dist/**'] },
    { assets: ['../**/*.js'], ignore: ['dist'] },
    { assets: ['../**/*.js', '.cache/*.js'], ignore: ['**/.cache/**'] },
    { assets: ['../**/*.js', farAwayPattern], ignore: ['**/upload-filter.test.ts'] },
    { assets: ['../**/*.js', farAwayPattern], ignore: ['upload-filter.test.ts'] },
    { assets: ['../**/*.js', farAwayPattern], ignore: [farAwayPattern] },
  ])('accepts the files that `glob` finds for %j', async sourcemaps => {
    const onDisk = await globFiles(sourcemaps.assets, { ignore: sourcemaps.ignore });

    expect(files.filter(filter(sourcemaps)).sort()).toEqual(onDisk.sort());
  });
});
