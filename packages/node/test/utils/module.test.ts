import { describe, expect, it } from 'vitest';
import { createGetModuleFromFilename } from '../../src';

describe('createGetModuleFromFilename', () => {
  it.each([
    ['/path/to/file.js', 'file'],
    ['/path/to/file.mjs', 'file'],
    ['/path/to/file.cjs', 'file'],
    ['file.js', 'file'],
  ])('returns the module name from a filename %s', (filename, expected) => {
    const getModule = createGetModuleFromFilename();
    expect(getModule(filename)).toBe(expected);
  });

  it('applies the given base path', () => {
    const getModule = createGetModuleFromFilename('/path/to/base');
    expect(getModule('/path/to/base/file.js')).toBe('file');
  });

  it('decodes URI-encoded file names', () => {
    const getModule = createGetModuleFromFilename();
    expect(getModule('/path%20with%space/file%20with%20spaces(1).js')).toBe('file with spaces(1)');
  });

  it('returns undefined if no filename is provided', () => {
    const getModule = createGetModuleFromFilename();
    expect(getModule(undefined)).toBeUndefined();
  });

  it.each([
    ['/path/to/base/node_modules/@sentry/test/file.js', '@sentry.test:file'],
    ['/path/to/base/node_modules/somePkg/file.js', 'somePkg:file'],
  ])('handles node_modules file paths %s', (filename, expected) => {
    const getModule = createGetModuleFromFilename();
    expect(getModule(filename)).toBe(expected);
  });

  it('handles windows paths with passed basePath and node_modules', () => {
    const getModule = createGetModuleFromFilename('C:\\path\\to\\base', true);
    expect(getModule('C:\\path\\to\\base\\node_modules\\somePkg\\file.js')).toBe('somePkg:file');
  });

  it('handles windows paths with default basePath', () => {
    const getModule = createGetModuleFromFilename(undefined, true);
    expect(getModule('C:\\path\\to\\base\\somePkg\\file.js')).toBe('file');
  });
});
