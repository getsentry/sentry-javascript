import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDefaultSdkInitFile, getFilenameFromNodeStartCommand } from '../../src/vite/utils';

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

describe('getFilenameFromNodeStartCommand', () => {
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
});
