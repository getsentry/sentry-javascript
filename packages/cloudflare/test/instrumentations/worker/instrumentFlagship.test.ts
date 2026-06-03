import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentFlagship } from '../../../src/instrumentations/worker/instrumentFlagship';

function createMockFlagship() {
  return {
    get: vi.fn().mockResolvedValue(true),
    getBooleanValue: vi.fn().mockResolvedValue(true),
    getStringValue: vi.fn().mockResolvedValue('variant-a'),
    getNumberValue: vi.fn().mockResolvedValue(42),
    getObjectValue: vi.fn().mockResolvedValue({ enabled: true }),
    getBooleanDetails: vi.fn().mockResolvedValue({ flagKey: 'dark-mode', value: true }),
    getStringDetails: vi.fn().mockResolvedValue({ flagKey: 'checkout-flow', value: 'v2' }),
    getNumberDetails: vi.fn().mockResolvedValue({ flagKey: 'max-retries', value: 5 }),
    getObjectDetails: vi.fn().mockResolvedValue({ flagKey: 'theme-config', value: { size: 16 } }),
  };
}

describe('instrumentFlagship', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards evaluation calls to the underlying binding', async () => {
    const flagship = createMockFlagship();
    const wrapped = instrumentFlagship(flagship);

    await wrapped.getBooleanValue('new-checkout', false, { userId: 'user-42' });

    expect(flagship.getBooleanValue).toHaveBeenCalledWith('new-checkout', false, { userId: 'user-42' });
  });

  it('records boolean values from getBooleanValue on the active span and scope', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({ setAttribute: vi.fn() } as any);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValue({ data: {} } as any);
    const insertSpy = vi.spyOn(SentryCore, '_INTERNAL_insertFlagToScope');
    const spanSpy = vi.spyOn(SentryCore, '_INTERNAL_addFeatureFlagToActiveSpan');

    const flagship = createMockFlagship();
    const wrapped = instrumentFlagship(flagship);

    await wrapped.getBooleanValue('new-checkout', false);

    expect(insertSpy).toHaveBeenCalledWith('new-checkout', true);
    expect(spanSpy).toHaveBeenCalledWith('new-checkout', true);
  });

  it('does not record non-boolean values from typed value methods', async () => {
    const insertSpy = vi.spyOn(SentryCore, '_INTERNAL_insertFlagToScope');
    const spanSpy = vi.spyOn(SentryCore, '_INTERNAL_addFeatureFlagToActiveSpan');

    const flagship = createMockFlagship();
    const wrapped = instrumentFlagship(flagship);

    await wrapped.getStringValue('checkout-flow', 'v1');
    await wrapped.getNumberValue('max-retries', 3);
    await wrapped.getObjectValue('theme-config', { size: 14 });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(spanSpy).not.toHaveBeenCalled();
  });

  it('records boolean values from get() when the result is boolean', async () => {
    const insertSpy = vi.spyOn(SentryCore, '_INTERNAL_insertFlagToScope');
    const spanSpy = vi.spyOn(SentryCore, '_INTERNAL_addFeatureFlagToActiveSpan');

    const flagship = createMockFlagship();
    flagship.get.mockResolvedValueOnce('not-a-boolean');
    const wrapped = instrumentFlagship(flagship);

    await wrapped.get('string-flag', 'default');
    expect(insertSpy).not.toHaveBeenCalled();
    expect(spanSpy).not.toHaveBeenCalled();

    await wrapped.get('bool-flag', false);
    expect(insertSpy).toHaveBeenCalledWith('bool-flag', true);
    expect(spanSpy).toHaveBeenCalledWith('bool-flag', true);
  });

  it('records boolean values from details methods using the returned metadata', async () => {
    vi.spyOn(SentryCore, 'getActiveSpan').mockReturnValue({ setAttribute: vi.fn() } as any);
    vi.spyOn(SentryCore, 'spanToJSON').mockReturnValue({ data: {} } as any);
    const insertSpy = vi.spyOn(SentryCore, '_INTERNAL_insertFlagToScope');
    const spanSpy = vi.spyOn(SentryCore, '_INTERNAL_addFeatureFlagToActiveSpan');

    const flagship = createMockFlagship();
    const wrapped = instrumentFlagship(flagship);

    await wrapped.getBooleanDetails('dark-mode', false);

    expect(insertSpy).toHaveBeenCalledWith('dark-mode', true);
    expect(spanSpy).toHaveBeenCalledWith('dark-mode', true);
  });

  it('does not record non-boolean values from details methods', async () => {
    const insertSpy = vi.spyOn(SentryCore, '_INTERNAL_insertFlagToScope');
    const spanSpy = vi.spyOn(SentryCore, '_INTERNAL_addFeatureFlagToActiveSpan');

    const flagship = createMockFlagship();
    const wrapped = instrumentFlagship(flagship);

    await wrapped.getStringDetails('checkout-flow', 'v1');
    await wrapped.getNumberDetails('max-retries', 3);
    await wrapped.getObjectDetails('theme-config', { size: 14 });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(spanSpy).not.toHaveBeenCalled();
  });

  it('passes through non-evaluation properties unchanged', () => {
    const flagship = { ...createMockFlagship(), appId: 'app-123' };
    const wrapped = instrumentFlagship(flagship);

    expect(wrapped.appId).toBe('app-123');
  });
});
