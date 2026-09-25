import { describe, expect, it, vi } from 'vitest';

vi.mock('sentry', () => {
  throw new Error('`loader-utils` must not import the `sentry` CLI');
});

describe('loader-utils', () => {
  it('exports the loader helpers without loading the sentry CLI', async () => {
    const loaderUtils = await import('../../src/loader-utils');

    expect(loaderUtils.getCodeInjectionPosition).toBeInstanceOf(Function);
    expect(loaderUtils.createComponentNameAnnotateHooks).toBeInstanceOf(Function);
  });
});
