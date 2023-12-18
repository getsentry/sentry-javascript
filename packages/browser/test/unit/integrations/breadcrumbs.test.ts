import * as SentryCore from '@sentry/core';
import type { Client } from '@sentry/types';

import { Breadcrumbs, BrowserClient, Hub, flush } from '../../../src';
import { getDefaultBrowserClientOptions } from '../helper/browser-client-options';

const hub = new Hub();
let client: Client | undefined;

jest.mock('@sentry/core', () => {
  const original = jest.requireActual('@sentry/core');
  return {
    ...original,
    getCurrentHub: () => hub,
    getClient: () => client,
  };
});

describe('Breadcrumbs', () => {
  it('Should add sentry breadcrumb', async () => {
    client = new BrowserClient({
      ...getDefaultBrowserClientOptions(),
      dsn: 'https://username@domain/123',
      integrations: [new Breadcrumbs()],
    });

    SentryCore.getCurrentHub().bindClient(client);

    const addBreadcrumbSpy = jest.spyOn(SentryCore, 'addBreadcrumb').mockImplementation(() => {});

    client.captureMessage('test');
    await flush(2000);

    expect(addBreadcrumbSpy.mock.calls[0][0].category).toEqual('sentry.event');
    expect(addBreadcrumbSpy.mock.calls[0][0].message).toEqual('test');
  });
});
