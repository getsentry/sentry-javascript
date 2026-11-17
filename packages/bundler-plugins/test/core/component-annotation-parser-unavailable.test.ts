import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ComponentAnnotateHooks from '../../src/core/component-annotate-hooks';
import type * as ComponentAnnotation from '../../src/core/component-annotation-oxc';

vi.mock('../../src/core/component-annotation-oxc', async importOriginal => {
  return {
    ...(await importOriginal<typeof ComponentAnnotation>()),
    getOxcParseAstAsync: vi.fn(async () => null),
  };
});

const MESSAGE = 'Could not load `oxc-parser` for this platform. React components will not be annotated.';

describe('createComponentNameAnnotateHooks without a parser', () => {
  let hooks: typeof ComponentAnnotateHooks;

  beforeEach(async () => {
    vi.resetModules();
    hooks = await import('../../src/core/component-annotate-hooks');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves files unchanged and warns once through the logger', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const { transform } = hooks.createComponentNameAnnotateHooks([], false, { logger });

    await expect(transform('export const App = () => <div />;', '/src/app.jsx')).resolves.toBeNull();
    await expect(transform('export const Other = () => <span />;', '/src/other.jsx')).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(MESSAGE);
  });

  it('warns once through the console across hooks created without a logger', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const id of ['/src/app.jsx', '/src/other.jsx']) {
      const { transform } = hooks.createComponentNameAnnotateHooks([], false);
      await expect(transform('export const App = () => <div />;', id)).resolves.toBeNull();
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`[@sentry/bundler-plugins] ${MESSAGE}`);
  });
});
