import * as path from 'path';
import { describe, it, expect } from 'vitest';
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

  it('applies `ignore` after `assets`', () => {
    const shouldUpload = filter({ assets: 'dist/**', ignore: 'dist/app/vendor-*.js' });
    expect(shouldUpload(inDist)).toBe(true);
    expect(shouldUpload(vendor)).toBe(false);
  });
});
