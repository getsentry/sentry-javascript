import * as fs from 'fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDefaultSdkInitFile } from '../../src/vite/utils';

vi.mock('fs');

describe('findDefaultSdkInitFile', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return the server file if it exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.includes('sentry.server.config.js');
    });

    const result = findDefaultSdkInitFile('server');
    expect(result).toBe('sentry.server.config.js');
  });

  it('should return the client file if it exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.includes('sentry.client.config.js');
    });

    const result = findDefaultSdkInitFile('client');
    expect(result).toBe('sentry.client.config.js');
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

  it('should return the server file with .ts extension if it exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.includes('sentry.server.config.ts');
    });

    const result = findDefaultSdkInitFile('server');
    expect(result).toBe('sentry.server.config.ts');
  });

  it('should return the client file with .mjs extension if it exists', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(filePath => {
      return !(filePath instanceof URL) && filePath.includes('sentry.client.config.mjs');
    });

    const result = findDefaultSdkInitFile('client');
    expect(result).toBe('sentry.client.config.mjs');
  });

  it('should return undefined if no file with specified extensions exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = findDefaultSdkInitFile('server');
    expect(result).toBeUndefined();
  });
});
