import * as fs from 'fs';
import type { Nuxt } from 'nuxt/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addOTelCommonJSImportAlias, findDefaultSdkInitFile } from '../../src/vite/utils';

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
