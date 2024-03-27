import type { IncomingMessage, ServerResponse } from 'http';
import * as SentryCore from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, addTracingExtensions } from '@sentry/core';

import type { Client } from '@sentry/types';
import { wrapGetInitialPropsWithSentry, wrapGetServerSidePropsWithSentry } from '../../src/common';

const startSpanManualSpy = jest.spyOn(SentryCore, 'startSpanManual');

// The wrap* functions require the hub to have tracing extensions. This is normally called by the NodeClient
// constructor but the client isn't used in these tests.
addTracingExtensions();

describe('data-fetching function wrappers should create spans', () => {
  const route = '/tricks/[trickName]';
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = { headers: {}, url: 'http://dogs.are.great/tricks/kangaroo' } as IncomingMessage;
    res = { end: jest.fn() } as unknown as ServerResponse;

    jest.spyOn(SentryCore, 'hasTracingEnabled').mockReturnValue(true);
    jest.spyOn(SentryCore, 'getClient').mockImplementation(() => {
      return {
        getOptions: () => ({}),
        getDsn: () => {},
      } as Client;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('wrapGetServerSidePropsWithSentry', async () => {
    const origFunction = jest.fn(async () => ({ props: {} }));

    const wrappedOriginal = wrapGetServerSidePropsWithSentry(origFunction, route);
    await wrappedOriginal({ req, res } as any);

    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getServerSideProps (/tricks/[trickName])',
        op: 'function.nextjs',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        },
      }),
      expect.any(Function),
    );
  });

  test('wrapGetInitialPropsWithSentry', async () => {
    const origFunction = jest.fn(async () => ({}));

    const wrappedOriginal = wrapGetInitialPropsWithSentry(origFunction);
    await wrappedOriginal({ req, res, pathname: route } as any);

    expect(startSpanManualSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'getInitialProps (/tricks/[trickName])',
        op: 'function.nextjs',
        attributes: {
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.nextjs',
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        },
      }),
      expect.any(Function),
    );
  });
});
