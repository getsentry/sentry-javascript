import { afterEach, describe, expect, it, vi } from 'vitest';

import { createComponentNameAnnotateHooks } from '../../src/core/component-annotate-hooks';
import type * as ComponentAnnotation from '../../src/core/component-annotation-oxc';

vi.mock('../../src/core/component-annotation-oxc', async importOriginal => {
  return {
    ...(await importOriginal<typeof ComponentAnnotation>()),
    getOxcParseAstAsync: vi.fn(async () => null),
  };
});

const MESSAGE = 'Could not load `oxc-parser` for this platform. React components will not be annotated.';

// The "warn once" flag is module state, so the console variant lives in its own file to get a fresh module.
describe('createComponentNameAnnotateHooks without a parser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves files unchanged and warns once through the logger', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const { transform } = createComponentNameAnnotateHooks([], false, { logger });

    await expect(transform('export const App = () => <div />;', '/src/app.jsx')).resolves.toBeNull();
    await expect(transform('export const Other = () => <span />;', '/src/other.jsx')).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(MESSAGE);
  });
});
