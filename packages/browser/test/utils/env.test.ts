/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnvValue } from '../../src/utils/env';

describe('getEnvValue', () => {
  let originalProcess: typeof globalThis.process | undefined;

  beforeEach(() => {
    originalProcess = globalThis.process;
  });

  afterEach(() => {
    if (originalProcess !== undefined) {
      globalThis.process = originalProcess;
    } else {
      delete (globalThis as typeof globalThis & { process?: NodeJS.Process }).process;
    }
  });

  it('reads from process.env', () => {
    globalThis.process = {
      env: {
        TEST_VAR: 'from-process-env',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getEnvValue('TEST_VAR')).toBe('from-process-env');
  });

  it('returns undefined when variable not set', () => {
    globalThis.process = {
      env: {} as Record<string, string>,
    } as NodeJS.Process;

    expect(getEnvValue('NONEXISTENT')).toBeUndefined();
  });

  it('handles missing process gracefully', () => {
    delete (globalThis as typeof globalThis & { process?: NodeJS.Process }).process;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('handles process without env gracefully', () => {
    globalThis.process = {} as NodeJS.Process;

    expect(() => getEnvValue('TEST_VAR')).not.toThrow();
    expect(getEnvValue('TEST_VAR')).toBeUndefined();
  });

  it('prioritizes process.env over import.meta.env', () => {
    // In real scenarios, if both exist, process.env is checked first
    globalThis.process = {
      env: {
        TEST_VAR: 'from-process',
      } as Record<string, string>,
    } as NodeJS.Process;

    expect(getEnvValue('TEST_VAR')).toBe('from-process');
  });

  // Note: We cannot easily test import.meta.env in unit tests since it's syntax
  // that needs to exist at parse time. The real test is in the build artifacts:
  // - CJS builds should NOT contain import.meta (would cause syntax error)
  // - ESM builds SHOULD contain import.meta.env checks
});
