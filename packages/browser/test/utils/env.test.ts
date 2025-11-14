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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).process;
    }
  });

  it('returns value from process.env when available', () => {
    globalThis.process = {
      env: {
        TEST_VAR: 'test-value',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getEnvValue('TEST_VAR')).toBe('test-value');
  });

  it('returns undefined when process.env does not exist', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).process;

    expect(getEnvValue('NONEXISTENT')).toBeUndefined();
  });

  it('returns undefined when variable does not exist in process.env', () => {
    globalThis.process = {
      env: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getEnvValue('NONEXISTENT')).toBeUndefined();
  });

  it('handles missing process object gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).process;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('handles missing process.env gracefully', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.process = {} as any;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('handles process.env access throwing an error', () => {
    globalThis.process = {
      get env() {
        throw new Error('Access denied');
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('returns empty string when value is empty string in process.env', () => {
    globalThis.process = {
      env: {
        EMPTY_VAR: '',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    expect(getEnvValue('EMPTY_VAR')).toBe('');
  });
});
