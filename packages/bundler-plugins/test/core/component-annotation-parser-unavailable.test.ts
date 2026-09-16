import { describe, expect, it, vi } from 'vitest';

import { createComponentNameAnnotateHooks } from '../../src/core';
import type * as ComponentAnnotation from '../../src/core/component-annotation-oxc';

vi.mock('../../src/core/component-annotation-oxc', async importOriginal => {
  return {
    ...(await importOriginal<typeof ComponentAnnotation>()),
    getOxcParseAstAsync: vi.fn(async () => null),
  };
});

describe('createComponentNameAnnotateHooks without a parser', () => {
  it('leaves files unchanged and warns once', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const { transform } = createComponentNameAnnotateHooks([], false, { logger });

    await expect(transform('export const App = () => <div />;', '/src/app.jsx')).resolves.toBeNull();
    await expect(transform('export const Other = () => <span />;', '/src/other.jsx')).resolves.toBeNull();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not load `oxc-parser` for this platform. React components will not be annotated.',
    );
  });
});
