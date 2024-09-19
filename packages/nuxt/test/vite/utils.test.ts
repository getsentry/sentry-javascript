import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDefaultSdkInitFile, getStringSuffixDiff } from '../../src/vite/utils';

vi.mock('fs');

describe('findDefaultSdkInitFile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'])(
    'should return the server file with .%s extension if it exists',
    ext => {
      vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
        return !(filePath instanceof URL) && filePath.includes(`sentry.server.config.${ext}`);
      });

      const result = findDefaultSdkInitFile('server');
      expect(result).toBe(`sentry.server.config.${ext}`);
    },
  );

  it.each(['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'])(
    'should return the client file with .%s extension if it exists',
    ext => {
      vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
        return !(filePath instanceof URL) && filePath.includes(`sentry.client.config.${ext}`);
      });

      const result = findDefaultSdkInitFile('client');
      expect(result).toBe(`sentry.client.config.${ext}`);
    },
  );

  it('should return undefined if no file with specified extensions exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = findDefaultSdkInitFile('server');
    expect(result).toBeUndefined();
  });

  it('should return undefined if no file exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = findDefaultSdkInitFile('server');
    expect(result).toBeUndefined();
  });

  it('should return the server config file if server.config and instrument exist', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return (
        !(filePath instanceof URL) &&
        (filePath.includes('sentry.server.config.js') || filePath.includes('instrument.server.js'))
      );
    });

    const result = findDefaultSdkInitFile('server');
    expect(result).toBe('sentry.server.config.js');
  });
});

describe('getStringDiff', () => {
  it('should return the suffix of the longer string when there is a common prefix', () => {
    expect(getStringSuffixDiff('abcdef', 'abc')).toBe('def');
  });

  it('should return an empty string when both strings are identical', () => {
    expect(getStringSuffixDiff('abc', 'abc')).toBe('');
  });

  it('should return the entire longer string when the shorter string is empty', () => {
    expect(getStringSuffixDiff('abcdef', '')).toBe('abcdef');
  });

  it('should return the entire longer string when there is no overlap', () => {
    expect(getStringSuffixDiff('abcdef', 'ghijkl')).toBe('abcdef');
  });

  it('should return an empty string when the longer string is empty', () => {
    expect(getStringSuffixDiff('', 'abc')).toBe('');
  });

  it('should return the suffix of the longer string when the shorter string is a prefix', () => {
    expect(getStringSuffixDiff('abcdef', 'abcd')).toBe('ef');
  });
});
