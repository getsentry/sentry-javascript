import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  QUERY_END_INDICATOR,
  SENTRY_FUNCTIONS_REEXPORT,
  SENTRY_WRAPPED_ENTRY,
  constructFunctionReExport,
  extractFunctionReexportQueryParameters,
  findDefaultSdkInitFile,
  removeSentryQueryFromPath,
} from '../../src/vite/utils';

vi.mock('fs');

describe('findDefaultSdkInitFile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'])(
    'should return the server file path with .%s extension if it exists',
    ext => {
      vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
        return !(filePath instanceof URL) && filePath.includes(`sentry.server.config.${ext}`);
      });

      const result = findDefaultSdkInitFile('server');
      expect(result).toMatch(`packages/nuxt/sentry.server.config.${ext}`);
    },
  );

  it.each(['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'])(
    'should return the client file path with .%s extension if it exists',
    ext => {
      vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
        return !(filePath instanceof URL) && filePath.includes(`sentry.client.config.${ext}`);
      });

      const result = findDefaultSdkInitFile('client');
      expect(result).toMatch(`packages/nuxt/sentry.client.config.${ext}`);
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

  it('should return the server config file path if server.config and instrument exist', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return (
        !(filePath instanceof URL) &&
        (filePath.includes('sentry.server.config.js') || filePath.includes('instrument.server.js'))
      );
    });

    const result = findDefaultSdkInitFile('server');
    expect(result).toMatch('packages/nuxt/sentry.server.config.js');
  });
});

describe('removeSentryQueryFromPath', () => {
  it('strips the Sentry query part from the path', () => {
    const url = `/example/path${SENTRY_WRAPPED_ENTRY}${SENTRY_FUNCTIONS_REEXPORT}foo,${QUERY_END_INDICATOR}`;
    const url2 = `/example/path${SENTRY_WRAPPED_ENTRY}${QUERY_END_INDICATOR}`;
    const result = removeSentryQueryFromPath(url);
    const result2 = removeSentryQueryFromPath(url2);
    expect(result).toBe('/example/path');
    expect(result2).toBe('/example/path');
  });

  it('returns the same path if the specific query part is not present', () => {
    const url = '/example/path?other-query=param';
    const result = removeSentryQueryFromPath(url);
    expect(result).toBe(url);
  });
});

describe('extractFunctionReexportQueryParameters', () => {
  it.each([
    [`${SENTRY_FUNCTIONS_REEXPORT}foo,bar,${QUERY_END_INDICATOR}`, ['foo', 'bar']],
    [`${SENTRY_FUNCTIONS_REEXPORT}foo,bar,default${QUERY_END_INDICATOR}`, ['foo', 'bar', 'default']],
    [
      `${SENTRY_FUNCTIONS_REEXPORT}foo,a.b*c?d[e]f(g)h|i\\\\j(){hello},${QUERY_END_INDICATOR}`,
      ['foo', 'a\\.b\\*c\\?d\\[e\\]f\\(g\\)h\\|i\\\\\\\\j\\(\\)\\{hello\\}'],
    ],
    [`/example/path/${SENTRY_FUNCTIONS_REEXPORT}foo,bar${QUERY_END_INDICATOR}`, ['foo', 'bar']],
    [`${SENTRY_FUNCTIONS_REEXPORT}${QUERY_END_INDICATOR}`, []],
    ['?other-query=param', []],
  ])('extracts parameters from the query string: %s', (query, expected) => {
    const result = extractFunctionReexportQueryParameters(query);
    expect(result).toEqual(expected);
  });
});

describe('constructFunctionReExport', () => {
  it('constructs re-export code for given query parameters and entry ID', () => {
    const query = `${SENTRY_FUNCTIONS_REEXPORT}foo,bar,${QUERY_END_INDICATOR}}`;
    const query2 = `${SENTRY_FUNCTIONS_REEXPORT}foo,bar${QUERY_END_INDICATOR}}`;
    const entryId = './module';
    const result = constructFunctionReExport(query, entryId);
    const result2 = constructFunctionReExport(query2, entryId);

    const expected = `
async function reExport(...args) {
  const res = await import("./module");
  return res.foo.call(this, ...args);
}
export { reExport as foo };
async function reExport(...args) {
  const res = await import("./module");
  return res.bar.call(this, ...args);
}
export { reExport as bar };
`;
    expect(result.trim()).toBe(expected.trim());
    expect(result2.trim()).toBe(expected.trim());
  });

  it('constructs re-export code for a "default" query parameters and entry ID', () => {
    const query = `${SENTRY_FUNCTIONS_REEXPORT}default${QUERY_END_INDICATOR}}`;
    const entryId = './index';
    const result = constructFunctionReExport(query, entryId);

    const expected = `
async function reExport(...args) {
  const res = await import("./index");
  return res.default.call(this, ...args);
}
export { reExport as default };
`;
    expect(result.trim()).toBe(expected.trim());
  });

  it('returns an empty string if the query string is empty', () => {
    const query = '';
    const entryId = './module';
    const result = constructFunctionReExport(query, entryId);
    expect(result).toBe('');
  });
});
