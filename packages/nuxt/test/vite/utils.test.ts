import * as fs from 'fs';
import type { Nuxt } from 'nuxt/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addOTelCommonJSImportAlias,
  constructFunctionReExport,
  constructWrappedFunctionExportQuery,
  extractFunctionReexportQueryParameters,
  findDefaultSdkInitFile,
  getFilenameFromNodeStartCommand,
  QUERY_END_INDICATOR,
  removeSentryQueryFromPath,
  SENTRY_REEXPORTED_FUNCTIONS,
  SENTRY_WRAPPED_ENTRY,
  SENTRY_WRAPPED_FUNCTIONS,
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
        return !(filePath instanceof URL) && filePath.toString().includes(`sentry.server.config.${ext}`);
      });

      const result = findDefaultSdkInitFile('server');
      expect(result).toMatch(`packages/nuxt/sentry.server.config.${ext}`);
    },
  );

  it.each(['ts', 'js', 'mjs', 'cjs', 'mts', 'cts'])(
    'should return the client file path with .%s extension if it exists',
    ext => {
      vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
        return !(filePath instanceof URL) && filePath.toString().includes(`sentry.client.config.${ext}`);
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
        (filePath.toString().includes('sentry.server.config.js') ||
          filePath.toString().includes('instrument.server.js'))
      );
    });

    const result = findDefaultSdkInitFile('server');
    expect(result).toMatch('packages/nuxt/sentry.server.config.js');
  });

  it('should return the latest layer config file path if client config exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.toString().includes('sentry.client.config.ts');
    });

    const nuxtMock = {
      options: {
        _layers: [
          {
            cwd: 'packages/nuxt/module',
          },
          {
            cwd: 'packages/nuxt',
          },
        ],
      },
    } as Nuxt;

    const result = findDefaultSdkInitFile('client', nuxtMock);
    expect(result).toMatch('packages/nuxt/sentry.client.config.ts');
  });

  it('should return the latest layer config file path if server config exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return (
        !(filePath instanceof URL) &&
        (filePath.toString().includes('sentry.server.config.ts') ||
          filePath.toString().includes('instrument.server.ts'))
      );
    });

    const nuxtMock = {
      options: {
        _layers: [
          {
            cwd: 'packages/nuxt/module',
          },
          {
            cwd: 'packages/nuxt',
          },
        ],
      },
    } as Nuxt;

    const result = findDefaultSdkInitFile('server', nuxtMock);
    expect(result).toMatch('packages/nuxt/sentry.server.config.ts');
  });

  it('should return the latest layer config file path if client config exists in former layer', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.toString().includes('nuxt/sentry.client.config.ts');
    });

    const nuxtMock = {
      options: {
        _layers: [
          {
            cwd: 'packages/nuxt/module',
          },
          {
            cwd: 'packages/nuxt',
          },
        ],
      },
    } as Nuxt;

    const result = findDefaultSdkInitFile('client', nuxtMock);
    expect(result).toMatch('packages/nuxt/sentry.client.config.ts');
  });
});

describe('getFilenameFromPath', () => {
  it('should return the filename from a simple path', () => {
    const path = 'node ./server/index.mjs';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBe('index.mjs');
  });

  it('should return the filename from a nested path', () => {
    const path = 'node ./.output/whatever/path/server.js';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBe('server.js');
  });

  it('should return the filename from a Windows-style path', () => {
    const path = '.\\Projects\\my-app\\src\\main.js';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBe('main.js');
  });

  it('should return null for an empty path', () => {
    const path = '';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBeNull();
  });

  it('should return the filename when there are no directory separators', () => {
    const path = 'index.mjs';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBe('index.mjs');
  });

  it('should return null for paths with trailing slashes', () => {
    const path = 'node ./server/';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBeNull();
  });

  it('should return null for commands without file extensions', () => {
    const path = 'npx @azure/static-web-apps-cli start .output/public --api-location .output/server';
    const filename = getFilenameFromNodeStartCommand(path);
    expect(filename).toBeNull();
  });
});

describe('removeSentryQueryFromPath', () => {
  it('strips the Sentry query part from the path', () => {
    const url = `/example/path${SENTRY_WRAPPED_ENTRY}${SENTRY_WRAPPED_FUNCTIONS}foo,${QUERY_END_INDICATOR}`;
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
    [`${SENTRY_WRAPPED_FUNCTIONS}foo,bar,${QUERY_END_INDICATOR}`, { wrap: ['foo', 'bar'], reexport: [] }],
    [
      `${SENTRY_WRAPPED_FUNCTIONS}foo,bar,default${QUERY_END_INDICATOR}`,
      { wrap: ['foo', 'bar', 'default'], reexport: [] },
    ],
    [
      `${SENTRY_WRAPPED_FUNCTIONS}foo,a.b*c?d[e]f(g)h|i\\\\j(){hello},${QUERY_END_INDICATOR}`,
      { wrap: ['foo', 'a\\.b\\*c\\?d\\[e\\]f\\(g\\)h\\|i\\\\\\\\j\\(\\)\\{hello\\}'], reexport: [] },
    ],
    [`/example/path/${SENTRY_WRAPPED_FUNCTIONS}foo,bar${QUERY_END_INDICATOR}`, { wrap: ['foo', 'bar'], reexport: [] }],
    [
      `${SENTRY_WRAPPED_FUNCTIONS}foo,bar,${SENTRY_REEXPORTED_FUNCTIONS}${QUERY_END_INDICATOR}`,
      { wrap: ['foo', 'bar'], reexport: [] },
    ],
    [`${SENTRY_REEXPORTED_FUNCTIONS}${QUERY_END_INDICATOR}`, { wrap: [], reexport: [] }],
    [
      `/path${SENTRY_WRAPPED_FUNCTIONS}foo,bar${SENTRY_REEXPORTED_FUNCTIONS}bar${QUERY_END_INDICATOR}`,
      { wrap: ['foo', 'bar'], reexport: ['bar'] },
    ],
    ['?other-query=param', { wrap: [], reexport: [] }],
  ])('extracts parameters from the query string: %s', (query, expected) => {
    const result = extractFunctionReexportQueryParameters(query);
    expect(result).toEqual(expected);
  });
});

describe('constructWrappedFunctionExportQuery', () => {
  it.each([
    [{ '.': ['handler'] }, ['handler'], `${SENTRY_WRAPPED_FUNCTIONS}handler`],
    [{ '.': ['handler'], './module': ['server'] }, [], `${SENTRY_REEXPORTED_FUNCTIONS}handler,server`],
    [
      { '.': ['handler'], './module': ['server'] },
      ['server'],
      `${SENTRY_WRAPPED_FUNCTIONS}server${SENTRY_REEXPORTED_FUNCTIONS}handler`,
    ],
    [
      { '.': ['handler', 'otherFunction'] },
      ['handler'],
      `${SENTRY_WRAPPED_FUNCTIONS}handler${SENTRY_REEXPORTED_FUNCTIONS}otherFunction`,
    ],
    [{ '.': ['handler', 'otherFn'] }, ['handler', 'otherFn'], `${SENTRY_WRAPPED_FUNCTIONS}handler,otherFn`],
    [{ '.': ['bar'], './module': ['foo'] }, ['bar', 'foo'], `${SENTRY_WRAPPED_FUNCTIONS}bar,foo`],
    [{ '.': ['foo', 'bar'] }, ['foo'], `${SENTRY_WRAPPED_FUNCTIONS}foo${SENTRY_REEXPORTED_FUNCTIONS}bar`],
    [{ '.': ['foo', 'bar'] }, ['bar'], `${SENTRY_WRAPPED_FUNCTIONS}bar${SENTRY_REEXPORTED_FUNCTIONS}foo`],
    [{ '.': ['foo', 'bar'] }, ['foo', 'bar'], `${SENTRY_WRAPPED_FUNCTIONS}foo,bar`],
    [{ '.': ['foo', 'bar'] }, [], `${SENTRY_REEXPORTED_FUNCTIONS}foo,bar`],
  ])(
    'constructs re-export query for exportedBindings: %j and entrypointWrappedFunctions: %j',
    (exportedBindings, entrypointWrappedFunctions, expected) => {
      const result = constructWrappedFunctionExportQuery(exportedBindings, entrypointWrappedFunctions);
      expect(result).toBe(expected);
    },
  );

  it('logs a warning if no functions are found for re-export and debug is true', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exportedBindings = { '.': ['handler'] };
    const entrypointWrappedFunctions = ['nonExistentFunction'];
    const debug = true;

    const result = constructWrappedFunctionExportQuery(exportedBindings, entrypointWrappedFunctions, debug);
    expect(result).toBe('?sentry-query-reexported-functions=handler');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[Sentry] No functions found to wrap. In case the server needs to export async functions other than `handler` or  `server`, consider adding the name(s) to Sentry's build options `sentry.experimental_entrypointWrappedFunctions` in `nuxt.config.ts`.",
    );

    consoleWarnSpy.mockRestore();
  });
});

describe('constructFunctionReExport', () => {
  it('constructs re-export code for given query parameters and entry ID', () => {
    const query = `${SENTRY_WRAPPED_FUNCTIONS}foo,bar,${QUERY_END_INDICATOR}}`;
    const query2 = `${SENTRY_WRAPPED_FUNCTIONS}foo,bar${QUERY_END_INDICATOR}}`;
    const entryId = './module';
    const result = constructFunctionReExport(query, entryId);
    const result2 = constructFunctionReExport(query2, entryId);

    const expected = `
async function foo_sentryWrapped(...args) {
  const res = await import("./module");
  return res.foo.call(this, ...args);
}
export { foo_sentryWrapped as foo };
async function bar_sentryWrapped(...args) {
  const res = await import("./module");
  return res.bar.call(this, ...args);
}
export { bar_sentryWrapped as bar };
`;
    expect(result.trim()).toBe(expected.trim());
    expect(result2.trim()).toBe(expected.trim());
  });

  it('constructs re-export code for a "default" query parameters and entry ID', () => {
    const query = `${SENTRY_WRAPPED_FUNCTIONS}default${QUERY_END_INDICATOR}}`;
    const entryId = './index';
    const result = constructFunctionReExport(query, entryId);

    const expected = `
async function default_sentryWrapped(...args) {
  const res = await import("./index");
  return res.default.call(this, ...args);
}
export { default_sentryWrapped as default };
`;
    expect(result.trim()).toBe(expected.trim());
  });

  it('constructs re-export code for a "default" query parameters and entry ID', () => {
    const query = `${SENTRY_WRAPPED_FUNCTIONS}default${QUERY_END_INDICATOR}}`;
    const entryId = './index';
    const result = constructFunctionReExport(query, entryId);

    const expected = `
async function default_sentryWrapped(...args) {
  const res = await import("./index");
  return res.default.call(this, ...args);
}
export { default_sentryWrapped as default };
`;
    expect(result.trim()).toBe(expected.trim());
  });

  it('constructs re-export code for a mix of wrapped and re-exported functions', () => {
    const query = `${SENTRY_WRAPPED_FUNCTIONS}foo,${SENTRY_REEXPORTED_FUNCTIONS}bar${QUERY_END_INDICATOR}`;
    const entryId = './module';
    const result = constructFunctionReExport(query, entryId);

    const expected = `
async function foo_sentryWrapped(...args) {
  const res = await import("./module");
  return res.foo.call(this, ...args);
}
export { foo_sentryWrapped as foo };
export { bar } from "./module";
`;
    expect(result.trim()).toBe(expected.trim());
  });

  it('does not re-export a default export for regular re-exported functions', () => {
    const query = `${SENTRY_WRAPPED_FUNCTIONS}foo${SENTRY_REEXPORTED_FUNCTIONS}default${QUERY_END_INDICATOR}`;
    const entryId = './module';
    const result = constructFunctionReExport(query, entryId);

    const expected = `
async function foo_sentryWrapped(...args) {
  const res = await import("./module");
  return res.foo.call(this, ...args);
}
export { foo_sentryWrapped as foo };
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

describe('addOTelCommonJSImportAlias', () => {
  it('adds alias for @opentelemetry/resources when options.alias does not exist', () => {
    const nuxtMock: Nuxt = {
      options: { dev: true },
    } as unknown as Nuxt;

    addOTelCommonJSImportAlias(nuxtMock);

    expect(nuxtMock.options.alias).toEqual({
      '@opentelemetry/resources': '@opentelemetry/resources/build/src/index.js',
    });
  });

  it('adds alias for @opentelemetry/resources when options.alias already exists', () => {
    const nuxtMock: Nuxt = {
      options: {
        dev: true,
        alias: {
          'existing-alias': 'some-path',
        },
      },
    } as unknown as Nuxt;

    addOTelCommonJSImportAlias(nuxtMock);

    expect(nuxtMock.options.alias).toEqual({
      'existing-alias': 'some-path',
      '@opentelemetry/resources': '@opentelemetry/resources/build/src/index.js',
    });
  });

  it('does not override existing alias for @opentelemetry/resources', () => {
    const nuxtMock: Nuxt = {
      options: {
        dev: true,
        alias: {
          '@opentelemetry/resources': 'some-other-path',
        },
      },
    } as unknown as Nuxt;

    addOTelCommonJSImportAlias(nuxtMock);

    expect(nuxtMock.options.alias).toEqual({
      '@opentelemetry/resources': 'some-other-path',
    });
  });

  it('does not add alias when not development mode', () => {
    const nuxtMock: Nuxt = {
      options: {},
    } as unknown as Nuxt;

    addOTelCommonJSImportAlias(nuxtMock);

    expect(nuxtMock.options.alias).toBeUndefined();
  });
});
