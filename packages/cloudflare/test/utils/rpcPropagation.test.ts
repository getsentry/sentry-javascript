import { describe, expect, it } from 'vitest';
import type { CloudflareOptions } from '../../src/client';
import { createRpcPropagationResolver } from '../../src/utils/rpcPropagation';

function resolver(enableRpcTracePropagation?: CloudflareOptions['enableRpcTracePropagation']) {
  return createRpcPropagationResolver({ enableRpcTracePropagation } as CloudflareOptions);
}

describe('createRpcPropagationResolver', () => {
  it('propagates to nothing when no options are available', () => {
    const shouldPropagate = createRpcPropagationResolver(undefined);

    expect(shouldPropagate('MY_DO')).toBe(false);
  });

  it('propagates to nothing when the option is unset', () => {
    const shouldPropagate = resolver(undefined);

    expect(shouldPropagate('MY_DO')).toBe(false);
    expect(shouldPropagate('EXTERNAL')).toBe(false);
  });

  it('propagates to nothing when the option is `false`', () => {
    const shouldPropagate = resolver(false);

    expect(shouldPropagate('MY_DO')).toBe(false);
  });

  it('propagates to every binding when the option is `true`', () => {
    const shouldPropagate = resolver(true);

    expect(shouldPropagate('MY_DO')).toBe(true);
    expect(shouldPropagate('EXTERNAL')).toBe(true);
  });

  it('propagates only to allowlisted binding names', () => {
    const shouldPropagate = resolver(['MY_DO', 'EXTERNAL']);

    expect(shouldPropagate('MY_DO')).toBe(true);
    expect(shouldPropagate('EXTERNAL')).toBe(true);
    expect(shouldPropagate('OTHER')).toBe(false);
  });

  it('propagates to nothing for an empty allowlist', () => {
    const shouldPropagate = resolver([]);

    expect(shouldPropagate('MY_DO')).toBe(false);
  });

  it('matches binding names exactly, never as a substring', () => {
    const shouldPropagate = resolver(['DB']);

    expect(shouldPropagate('DB')).toBe(true);
    expect(shouldPropagate('MY_DB')).toBe(false);
    expect(shouldPropagate('DB_REPLICA')).toBe(false);
  });

  it('supports regular expressions for pattern matching', () => {
    const shouldPropagate = resolver([/^SVC_/]);

    expect(shouldPropagate('SVC_ORDERS')).toBe(true);
    expect(shouldPropagate('SVC_USERS')).toBe(true);
    expect(shouldPropagate('ORDERS')).toBe(false);
  });

  describe('union with the binding names injected by the Vite plugin', () => {
    // The Vite plugin merges same-worker binding names into `enableRpcTracePropagation` at build
    // time, so by the time the resolver sees the option the union has already happened. These
    // cases pin the resulting semantics down.

    it('propagates to the injected binding names when the user sets nothing', () => {
      const shouldPropagate = resolver(['MY_DO']);

      expect(shouldPropagate('MY_DO')).toBe(true);
      expect(shouldPropagate('EXTERNAL')).toBe(false);
    });

    it('propagates to injected and user-supplied binding names together', () => {
      const shouldPropagate = resolver(['MY_DO', 'EXTERNAL']);

      expect(shouldPropagate('MY_DO')).toBe(true);
      expect(shouldPropagate('EXTERNAL')).toBe(true);
    });

    it('propagates to nothing when the user sets `false`, discarding the injected names', () => {
      const shouldPropagate = resolver(false);

      expect(shouldPropagate('MY_DO')).toBe(false);
    });
  });
});
