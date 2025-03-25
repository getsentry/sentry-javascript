import * as SentryCore from '@sentry/core';
import { resetInstrumentationHandlers } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../../src';
import type { NodeClient } from '../../src';
import { consoleIntegration } from '../../src/integrations/console';

const addBreadcrumbSpy = vi.spyOn(SentryCore, 'addBreadcrumb');

vi.spyOn(console, 'log').mockImplementation(() => {
  // noop so that we don't spam the logs
});

afterEach(() => {
  vi.clearAllMocks();
  resetInstrumentationHandlers();
});

describe('Console integration', () => {
  it('should add a breadcrumb on console.log', () => {
    consoleIntegration().setup?.(getClient() as NodeClient);

    // eslint-disable-next-line no-console
    console.log('test');

    expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      {
        category: 'console',
        level: 'log',
        message: 'test',
      },
      {
        input: ['test'],
        level: 'log',
      },
    );
  });
});
