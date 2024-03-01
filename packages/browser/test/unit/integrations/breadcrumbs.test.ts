import * as SentryCore from '@sentry/core';

import { BrowserClient, breadcrumbsIntegration, flush } from '../../../src';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

describe('Breadcrumbs', () => {
  it('Should add sentry breadcrumb', async () => {
    const client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [breadcrumbsIntegration()],
    });

    SentryCore.setCurrentClient(client);
    client.init();

    const addBreadcrumbSpy = jest.spyOn(SentryCore, 'addBreadcrumb').mockImplementation(() => {});

    client.captureMessage('test');
    await flush(2000);

    expect(addBreadcrumbSpy.mock.calls[0][0].category).toEqual('sentry.event');
    expect(addBreadcrumbSpy.mock.calls[0][0].message).toEqual('test');
  });
});
