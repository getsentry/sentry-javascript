/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnvValue } from '../../src/utils/env';

describe('getEnvValue', () => {
  let originalProcess: typeof globalThis.process | undefined;

  beforeEach(() => {
    // Store original values
    originalProcess = globalThis.process;
  });

  afterEach(() => {
    // Restore original values
    if (originalProcess !== undefined) {
      globalThis.process = originalProcess;
    } else {
      delete (globalThis as any).process;
    }
  });

  it('returns value from process.env when available', () => {
    globalThis.process = {
      env: {
        TEST_VAR: 'test-value',
      },
    } as any;

    expect(getEnvValue('TEST_VAR')).toBe('test-value');
  });

  it('returns undefined when process.env does not exist', () => {
    delete (globalThis as any).process;

    expect(getEnvValue('NONEXISTENT')).toBeUndefined();
  });

  it('returns undefined when variable does not exist in process.env', () => {
    globalThis.process = {
      env: {},
    } as any;

    expect(getEnvValue('NONEXISTENT')).toBeUndefined();
  });

  it('handles missing process object gracefully', () => {
    delete (globalThis as any).process;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('handles missing process.env gracefully', () => {
    globalThis.process = {} as any;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('handles process.env access throwing an error', () => {
    globalThis.process = {
      get env() {
        throw new Error('Access denied');
      },
    } as any;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('returns empty string when value is empty string in process.env', () => {
    globalThis.process = {
      env: {
        EMPTY_VAR: '',
      },
    } as any;

    expect(getEnvValue('EMPTY_VAR')).toBe('');
  });

  // Note: import.meta.env support cannot be easily unit tested because import.meta
  // is a read-only compile-time construct that cannot be mocked. The import.meta.env
  // functionality is tested via e2e tests with real Vite-based frameworks (Vue, Astro, etc.)
  //
  // The implementation safely checks for import.meta.env existence and will use it
  // when available in Vite/Astro/SvelteKit builds.
});
