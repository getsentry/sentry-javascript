import * as SentryCore from '@sentry/core';
import { resetInstrumentationHandlers } from '@sentry/core';
import { getClient } from '../../src';
import type { NodeClient } from '../../src';
import { consoleIntegration } from '../../src/integrations/console';

const addBreadcrumbSpy = jest.spyOn(SentryCore, 'addBreadcrumb');

jest.spyOn(console, 'log').mockImplementation(() => {
  // noop so that we don't spam the logs
});

afterEach(() => {
  jest.clearAllMocks();
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

  it('should truncate breadcrumbs with more than 2 KB message size', () => {
    consoleIntegration().setup?.(getClient() as NodeClient);

    const longMsg = 'A'.repeat(10_000);

    // eslint-disable-next-line no-console
    console.log(longMsg);

    expect(addBreadcrumbSpy).toHaveBeenCalledTimes(1);
    expect(addBreadcrumbSpy).toHaveBeenCalledWith(
      {
        category: 'console',
        level: 'log',
        message: `${'A'.repeat(2048)}...`,
      },
      {
        input: [longMsg],
        level: 'log',
      },
    );
  });
});
