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

describe('createComponentNameAnnotateHooks without a parser or logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once through the console across hooks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (const id of ['/src/app.jsx', '/src/other.jsx']) {
      const { transform } = createComponentNameAnnotateHooks([], false);
      await expect(transform('export const App = () => <div />;', id)).resolves.toBeNull();
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(`[@sentry/bundler-plugins] ${MESSAGE}`);
  });
});
