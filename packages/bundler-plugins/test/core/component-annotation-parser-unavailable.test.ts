import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ComponentAnnotation from '../../src/core/component-annotation-oxc';

vi.mock('../../src/core/component-annotation-oxc', async importOriginal => {
  return {
    ...(await importOriginal<typeof ComponentAnnotation>()),
    getOxcParseAstAsync: vi.fn(async () => null),
  };
});

const MESSAGE = 'Could not load `oxc-parser` for this platform. React components will not be annotated.';

// Each test imports the whole core module graph afresh after `resetModules`,
// which takes several seconds on a slow CI runner.
const IMPORT_TIMEOUT = 30_000;

describe('createComponentNameAnnotateHooks without a parser', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves files unchanged and warns once through the logger', { timeout: IMPORT_TIMEOUT }, async () => {
    const { createComponentNameAnnotateHooks } = await import('../../src/core');
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const { transform } = createComponentNameAnnotateHooks([], false, { logger });

    await expect(transform('export const App = () => <div />;', '/src/app.jsx')).resolves.toBeNull();
    await expect(transform('export const Other = () => <span />;', '/src/other.jsx')).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(MESSAGE);
  });

  it('warns once through the console across hooks created without a logger', { timeout: IMPORT_TIMEOUT }, async () => {
    const { createComponentNameAnnotateHooks } = await import('../../src/core');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const id of ['/src/app.jsx', '/src/other.jsx']) {
      const { transform } = createComponentNameAnnotateHooks([], false);
      await expect(transform('export const App = () => <div />;', id)).resolves.toBeNull();
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`[@sentry/bundler-plugins] ${MESSAGE}`);
  });
});
