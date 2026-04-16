import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudflareOptions } from '../../src/client';
import { getEffectiveRpcPropagation } from '../../src/utils/rpcOptions';

// Mock the debug module
vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    debug: {
      warn: vi.fn(),
    },
  };
});

// Mock DEBUG_BUILD
vi.mock('../../src/debug-build', () => ({
  DEBUG_BUILD: true,
}));

import { debug } from '@sentry/core';

describe('getEffectiveRpcPropagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when neither option is set', () => {
    const options: CloudflareOptions = {};
    expect(getEffectiveRpcPropagation(options)).toBe(false);
  });

  it('returns enableRpcTracePropagation when only it is set (boolean true)', () => {
    const options: CloudflareOptions = { enableRpcTracePropagation: true };
    expect(getEffectiveRpcPropagation(options)).toBe(true);
  });

  it('returns enableRpcTracePropagation when only it is set (boolean false)', () => {
    const options: CloudflareOptions = { enableRpcTracePropagation: false };
    expect(getEffectiveRpcPropagation(options)).toBe(false);
  });

  it('returns true for instrumentPrototypeMethods when only it is set (with deprecation warning)', () => {
    const options: CloudflareOptions = { instrumentPrototypeMethods: true };
    expect(getEffectiveRpcPropagation(options)).toBe(true);
    expect(debug.warn).toHaveBeenCalledWith(expect.stringContaining('`instrumentPrototypeMethods` is deprecated'));
  });

  it('returns true for instrumentPrototypeMethods array when only it is set (with deprecation warning)', () => {
    const options: CloudflareOptions = { instrumentPrototypeMethods: ['myMethod'] };
    expect(getEffectiveRpcPropagation(options)).toBe(true);
    expect(debug.warn).toHaveBeenCalledWith(expect.stringContaining('`instrumentPrototypeMethods` is deprecated'));
  });

  it('returns false for empty instrumentPrototypeMethods array (with deprecation warning)', () => {
    const options: CloudflareOptions = { instrumentPrototypeMethods: [] };
    expect(getEffectiveRpcPropagation(options)).toBe(false);
    expect(debug.warn).toHaveBeenCalledWith(expect.stringContaining('`instrumentPrototypeMethods` is deprecated'));
  });

  it('prefers enableRpcTracePropagation over instrumentPrototypeMethods when both are set', () => {
    const options: CloudflareOptions = {
      enableRpcTracePropagation: true,
      instrumentPrototypeMethods: false,
    };
    expect(getEffectiveRpcPropagation(options)).toBe(true);
    expect(debug.warn).toHaveBeenCalledWith(
      expect.stringContaining('Both `enableRpcTracePropagation` and `instrumentPrototypeMethods` are set'),
    );
  });

  it('prefers enableRpcTracePropagation (false) over instrumentPrototypeMethods (true) when both are set', () => {
    const options: CloudflareOptions = {
      enableRpcTracePropagation: false,
      instrumentPrototypeMethods: true,
    };
    expect(getEffectiveRpcPropagation(options)).toBe(false);
    expect(debug.warn).toHaveBeenCalledWith(
      expect.stringContaining('Both `enableRpcTracePropagation` and `instrumentPrototypeMethods` are set'),
    );
  });
});
