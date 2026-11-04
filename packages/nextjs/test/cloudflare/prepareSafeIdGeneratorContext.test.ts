import { describe, expect, it } from 'vitest';
import '../../src/cloudflare';

const RUNNER_KEY = Symbol.for('__SENTRY_SAFE_RANDOM_ID_WRAPPER__');

describe('@sentry/nextjs/cloudflare', () => {
  it('registers the safe random ID runner when the module loads', () => {
    const runner = (globalThis as Record<symbol, unknown>)[RUNNER_KEY] as (<T>(callback: () => T) => T) | undefined;
    expect(runner).toBeTypeOf('function');
    expect(runner!(() => 'ok')).toBe('ok');
  });
});
